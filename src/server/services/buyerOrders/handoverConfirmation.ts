import crypto from "node:crypto";
import QRCode from "qrcode";
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
import { generateReceiptInBackground } from "./receiptPdf";

type HandoverMethod = "QR" | "PIN";

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

function expectedStatusForCredential(order: {
	fulfillmentType: FulfillmentType;
	status: OrderStatus;
}): OrderStatus {
	return order.fulfillmentType === FulfillmentType.DELIVERY
		? OrderStatus.IN_TRANSIT
		: OrderStatus.READY;
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
	const expected = expectedStatusForCredential(order);
	if (order.status !== expected) {
		throw invalidOrderState(
			"Confirmation is not available for this order status.",
		);
	}
}

async function assertSuccessfulPayment(orderId: string) {
	const payment = await getPaymentByOrderIdDB({ buyerOrderId: orderId });
	if (!payment?.webhookVerified || payment.status !== PaymentStatus.SUCCESS) {
		throw invalidOrderState("This order has not been paid.");
	}
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
			: OrderStatus.READY;
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
