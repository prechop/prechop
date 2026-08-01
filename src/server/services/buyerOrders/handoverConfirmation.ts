import QRCode from "qrcode";
import {
	handoverUnavailableMessage,
	isBuyerHandoverEligible,
} from "@/constants/orderLifecycle";
import { deriveHandoverCredential } from "@/server/constants/handoverCredential";
import {
	AppError,
	ErrForbidden,
	ErrOrderNotFound,
	invalidOrderState,
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
const UNPAID_HANDOVER_STATUSES = new Set<OrderStatus>([
	OrderStatus.PENDING_PAYMENT,
	OrderStatus.AWAITING_EXTERNAL_PAYMENT,
]);

function handoverBlocked(message: string, appCode: string) {
	return new AppError(message, 409, appCode);
}

function assertCredentialVisible(order: {
	fulfillmentType: FulfillmentType;
	status: OrderStatus;
	handoverCredentialUsedAt?: Date;
}) {
	if (order.handoverCredentialUsedAt) {
		throw handoverBlocked(
			"This confirmation credential has already been used.",
			"HANDOVER_CREDENTIAL_USED",
		);
	}
	if (
		!isBuyerHandoverEligible(
			order.status,
			order.fulfillmentType,
			order.handoverCredentialUsedAt,
		)
	) {
		throw handoverBlocked(
			handoverUnavailableMessage(order.fulfillmentType),
			"HANDOVER_NOT_ELIGIBLE",
		);
	}
}

async function assertSuccessfulPayment(orderId: string) {
	const payment = await getPaymentByOrderIdDB({ buyerOrderId: orderId });
	if (!payment?.webhookVerified || payment.status !== PaymentStatus.SUCCESS) {
		throw handoverBlocked(
			"This order has not been paid.",
			"HANDOVER_PAYMENT_NOT_VERIFIED",
		);
	}
}

function assertOrderPaidForHandover(status: OrderStatus) {
	if (SETTLED_ORDER_STATUSES.includes(status)) return;
	if (UNPAID_HANDOVER_STATUSES.has(status)) {
		throw handoverBlocked(
			"This order has not been paid.",
			"HANDOVER_PAYMENT_NOT_VERIFIED",
		);
	}
	throw handoverBlocked(
		"PIN reveal is not available for this order.",
		"HANDOVER_NOT_ELIGIBLE",
	);
}

async function ensureHandoverCredentialStored({
	orderId,
	order,
	tokenHash,
	pinHash,
}: {
	orderId: string;
	order: {
		handoverTokenHash?: string;
		handoverPinHash?: string;
		handoverCredentialUsedAt?: Date;
	};
	tokenHash: string;
	pinHash: string;
}) {
	if (order.handoverTokenHash && order.handoverPinHash) return;
	const saved = await setBuyerOrderHandoverCredentialDB({
		id: orderId,
		tokenHash,
		pinHash,
	});
	if (!saved) {
		const latest = await getBuyerOrderByIdDB({ id: orderId });
		if (latest?.handoverTokenHash && latest.handoverPinHash) return;
		throw handoverBlocked(
			"Confirmation credential is unavailable.",
			"HANDOVER_CREDENTIAL_UNAVAILABLE",
		);
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
	assertOrderPaidForHandover(order.status);
	await assertSuccessfulPayment(orderId);
	assertCredentialVisible(order);

	const credential = deriveHandoverCredential({
		_id: order._id.toString(),
		orderNumber: order.orderNumber,
		buyerId: order.buyerId.toString(),
		vendorId: order.vendorId.toString(),
	});
	await ensureHandoverCredentialStored({
		orderId,
		order,
		tokenHash: credential.qrTokenHash,
		pinHash: credential.pinHash,
	});

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
	assertOrderPaidForHandover(order.status);
	await assertSuccessfulPayment(orderId);
	assertCredentialVisible(order);

	const credential = deriveHandoverCredential({
		_id: order._id.toString(),
		orderNumber: order.orderNumber,
		buyerId: order.buyerId.toString(),
		vendorId: order.vendorId.toString(),
	});
	await ensureHandoverCredentialStored({
		orderId,
		order,
		tokenHash: credential.qrTokenHash,
		pinHash: credential.pinHash,
	});

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
	assertOrderPaidForHandover(order.status);
	await assertSuccessfulPayment(orderId);
	if (
		order.status === OrderStatus.COMPLETED ||
		order.handoverCredentialUsedAt
	) {
		throw handoverBlocked(
			"This order has already been confirmed.",
			"HANDOVER_CREDENTIAL_USED",
		);
	}
	assertCredentialVisible(order);
	const now = new Date();
	if (order.handoverLockedUntil && order.handoverLockedUntil > now) {
		throw handoverBlocked(
			"Confirmation is temporarily locked.",
			"HANDOVER_CONFIRMATION_LOCKED",
		);
	}

	const credential = deriveHandoverCredential({
		_id: order._id.toString(),
		orderNumber: order.orderNumber,
		buyerId: order.buyerId.toString(),
		vendorId: order.vendorId.toString(),
	});
	await ensureHandoverCredentialStored({
		orderId,
		order,
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
		throw handoverBlocked(
			"Invalid confirmation code.",
			"HANDOVER_INVALID_CODE",
		);
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
