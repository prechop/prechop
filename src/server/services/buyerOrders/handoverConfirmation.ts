import crypto from "node:crypto";
import QRCode from "qrcode";
import {
	handoverUnavailableMessage,
	isBuyerHandoverEligible,
} from "@/constants/orderLifecycle";
import {
	ENCRYPTION_KEY,
	ErrForbidden,
	ErrOrderNotFound,
	invalidOrderState,
	JWT_ACCESS_TOKEN_SECRET,
	validationError,
} from "../../constants";
import hashToken from "../../constants/hashToken";
import {
	completeBuyerOrderHandoverDB,
	FulfillmentType,
	getBuyerOrderByIdDB,
	getPaymentByOrderIdDB,
	getVendorProfileByUserIdDB,
	OrderStatus,
	PaymentStatus,
	recordHandoverFailedAttemptDB,
	SETTLED_ORDER_STATUSES,
	setBuyerOrderHandoverCredentialDB,
} from "../../models";
import { recordAuditSync } from "../audit";
import { generateReceiptInBackground } from "./receiptPdf";

type HandoverMethod = "QR" | "PIN";

export interface AdminHandoverActor {
	userId: string;
	role?: string;
	ip?: string;
	userAgent?: string;
}

const MAX_PIN_ATTEMPTS = 5;
const LOCK_MS = 5 * 60 * 1000;

function handoverSecret(): string {
	const secret = ENCRYPTION_KEY || JWT_ACCESS_TOKEN_SECRET;
	if (!secret) {
		throw validationError("Confirmation credentials are unavailable.");
	}
	return secret;
}

function deriveCredential(order: {
	_id: string;
	orderNumber: string;
	buyerId: string;
	vendorId: string;
}) {
	const base = `${order._id}:${order.orderNumber}:${order.buyerId}:${order.vendorId}`;
	const token = crypto
		.createHmac("sha256", handoverSecret())
		.update(`qr:${base}`)
		.digest("hex");
	const pinSeed = crypto
		.createHmac("sha256", handoverSecret())
		.update(`pin:${base}`)
		.digest("hex");
	const pin = String(
		Number.parseInt(pinSeed.slice(0, 12), 16) % 1_000_000,
	).padStart(6, "0");
	return {
		qrToken: token,
		pin,
		qrTokenHash: hashToken(token),
		pinHash: hashToken(pin),
	};
}

function assertCredentialVisible(order: {
	fulfillmentType: FulfillmentType;
	status: OrderStatus;
	handoverCredentialUsedAt?: Date;
}) {
	if (order.handoverCredentialUsedAt) {
		throw invalidOrderState(
			"This confirmation credential has already been used.",
		);
	}
	if (
		!isBuyerHandoverEligible(
			order.status,
			order.fulfillmentType,
			order.handoverCredentialUsedAt,
		)
	) {
		throw invalidOrderState(
			handoverUnavailableMessage(order.fulfillmentType),
		);
	}
}

async function assertSuccessfulPayment(orderId: string) {
	const payment = await getPaymentByOrderIdDB({ buyerOrderId: orderId });
	if (!payment?.webhookVerified || payment.status !== PaymentStatus.SUCCESS) {
		throw invalidOrderState("This order has not been paid.");
	}
}

async function hasSuccessfulVerifiedPayment(orderId: string): Promise<boolean> {
	const payment = await getPaymentByOrderIdDB({ buyerOrderId: orderId });
	return (
		!!payment?.webhookVerified && payment.status === PaymentStatus.SUCCESS
	);
}

export async function getBuyerHandoverCredential({
	buyerId,
	orderId,
}: {
	buyerId: string;
	orderId: string;
}): Promise<{ qrToken: string; qrDataUrl: string; pin: string }> {
	const order = await getBuyerOrderByIdDB({ id: orderId });
	if (!order) throw ErrOrderNotFound;
	if (order.buyerId.toString() !== buyerId) throw ErrForbidden;
	if (!SETTLED_ORDER_STATUSES.includes(order.status)) {
		throw invalidOrderState("This order has not been paid.");
	}
	await assertSuccessfulPayment(orderId);
	assertCredentialVisible(order);

	const credential = deriveCredential({
		_id: order._id.toString(),
		orderNumber: order.orderNumber,
		buyerId: order.buyerId.toString(),
		vendorId: order.vendorId.toString(),
	});
	const saved = await setBuyerOrderHandoverCredentialDB({
		id: orderId,
		tokenHash: credential.qrTokenHash,
		pinHash: credential.pinHash,
	});
	if (!saved)
		throw invalidOrderState("Confirmation credential is unavailable.");

	return {
		qrToken: credential.qrToken,
		qrDataUrl: await QRCode.toDataURL(credential.qrToken, {
			width: 220,
			margin: 1,
		}),
		pin: credential.pin,
	};
}

export async function getAdminHandoverVerificationDetails({
	orderId,
}: {
	orderId: string;
}) {
	const order = await getBuyerOrderByIdDB({ id: orderId });
	if (!order) throw ErrOrderNotFound;
	const handoverEligible = isBuyerHandoverEligible(
		order.status,
		order.fulfillmentType,
		order.handoverCredentialUsedAt,
	);
	const paymentVerified = await hasSuccessfulVerifiedPayment(orderId);

	return {
		orderId: order._id.toString(),
		orderNumber: order.orderNumber,
		fulfillmentType: order.fulfillmentType,
		status: order.status,
		isPaid: SETTLED_ORDER_STATUSES.includes(order.status),
		paymentVerified,
		handoverEligible,
		qrGenerated: !!order.handoverTokenHash,
		pinGenerated: !!order.handoverPinHash,
		credentialGeneratedAt: order.handoverCredentialCreatedAt ?? null,
		credentialUsedAt: order.handoverCredentialUsedAt ?? null,
		failedAttempts: order.handoverFailedAttempts ?? 0,
		lockedUntil: order.handoverLockedUntil ?? null,
		confirmedAt: order.confirmedAt ?? null,
		confirmedBy: order.confirmedBy ?? null,
		confirmationMethod: order.confirmationMethod ?? null,
		confirmationVendorId: order.confirmationVendorId ?? null,
		confirmationBuyerId: order.confirmationBuyerId ?? null,
		confirmationOrderId: order.confirmationOrderId ?? null,
		history: (order.timeline ?? [])
			.filter((entry) =>
				[
					"HANDOVER_CREDENTIAL_CREATED",
					"HANDOVER_FAILED_ATTEMPT",
					"HANDOVER_CONFIRMED",
					"STATUS_CHANGE",
				].includes(entry.type),
			)
			.map((entry) => ({
				at: entry.at,
				type: entry.type,
				actor: entry.actor,
				actorId: entry.actorId,
				note: entry.note,
				data: entry.data,
			})),
	};
}

export async function revealAdminHandoverPin({
	orderId,
	actor,
}: {
	orderId: string;
	actor: AdminHandoverActor;
}): Promise<{ orderId: string; orderNumber: string; pin: string }> {
	const order = await getBuyerOrderByIdDB({ id: orderId });
	if (!order) throw ErrOrderNotFound;
	if (!SETTLED_ORDER_STATUSES.includes(order.status)) {
		throw invalidOrderState("This order has not been paid.");
	}
	await assertSuccessfulPayment(orderId);
	assertCredentialVisible(order);

	const credential = deriveCredential({
		_id: order._id.toString(),
		orderNumber: order.orderNumber,
		buyerId: order.buyerId.toString(),
		vendorId: order.vendorId.toString(),
	});
	const saved = await setBuyerOrderHandoverCredentialDB({
		id: orderId,
		tokenHash: credential.qrTokenHash,
		pinHash: credential.pinHash,
	});
	if (!saved)
		throw invalidOrderState("Confirmation credential is unavailable.");

	await recordAuditSync({
		userId: actor.userId,
		role: actor.role,
		action: "ORDER_HANDOVER_PIN_REVEAL",
		resourceType: "buyerOrders",
		resourceId: orderId,
		newState: {
			orderNumber: order.orderNumber,
			fulfillmentType: order.fulfillmentType,
			status: order.status,
			credentialGeneratedBeforeReveal: !!order.handoverPinHash,
		},
		ipAddress: actor.ip,
		userAgent: actor.userAgent,
	});

	return {
		orderId,
		orderNumber: order.orderNumber,
		pin: credential.pin,
	};
}

export async function confirmOrderHandover({
	vendorUserId,
	orderId,
	method,
	code,
}: {
	vendorUserId: string;
	orderId: string;
	method: HandoverMethod;
	code: string;
}) {
	const vendor = await getVendorProfileByUserIdDB({ userId: vendorUserId });
	if (!vendor) throw ErrForbidden;
	const order = await getBuyerOrderByIdDB({ id: orderId });
	if (!order) throw ErrOrderNotFound;
	if (order.vendorId.toString() !== vendor._id.toString()) throw ErrForbidden;
	if (!SETTLED_ORDER_STATUSES.includes(order.status)) {
		throw invalidOrderState("This order has not been paid.");
	}
	await assertSuccessfulPayment(orderId);
	if (
		order.status === OrderStatus.COMPLETED ||
		order.handoverCredentialUsedAt
	) {
		throw invalidOrderState("This order has already been confirmed.");
	}
	assertCredentialVisible(order);
	const now = new Date();
	if (order.handoverLockedUntil && order.handoverLockedUntil > now) {
		throw invalidOrderState("Confirmation is temporarily locked.");
	}

	const credential = deriveCredential({
		_id: order._id.toString(),
		orderNumber: order.orderNumber,
		buyerId: order.buyerId.toString(),
		vendorId: order.vendorId.toString(),
	});
	await setBuyerOrderHandoverCredentialDB({
		id: orderId,
		tokenHash: credential.qrTokenHash,
		pinHash: credential.pinHash,
	});
	const expectedHash =
		method === "QR" ? credential.qrTokenHash : credential.pinHash;
	const submittedHash = hashToken(code.trim());
	if (submittedHash !== expectedHash) {
		const attempts = (order.handoverFailedAttempts ?? 0) + 1;
		await recordHandoverFailedAttemptDB({
			id: orderId,
			lockUntil:
				attempts >= MAX_PIN_ATTEMPTS
					? new Date(now.getTime() + LOCK_MS)
					: undefined,
		});
		throw invalidOrderState("Invalid confirmation code.");
	}

	const fromStatus =
		order.fulfillmentType === FulfillmentType.DELIVERY
			? OrderStatus.IN_TRANSIT
			: order.status === OrderStatus.READY
				? OrderStatus.READY
				: OrderStatus.READY_FOR_PICKUP;
	const intermediateStatus =
		order.fulfillmentType === FulfillmentType.DELIVERY
			? OrderStatus.DELIVERED
			: OrderStatus.PICKED_UP;
	const completed = await completeBuyerOrderHandoverDB({
		id: orderId,
		fromStatus,
		intermediateStatus,
		confirmedAt: now,
		confirmedBy: vendorUserId,
		confirmationMethod: method,
		vendorId: vendor._id.toString(),
		buyerId: order.buyerId.toString(),
	});
	if (!completed) {
		throw invalidOrderState("This order could not be confirmed.");
	}
	generateReceiptInBackground(orderId);
	return completed;
}
