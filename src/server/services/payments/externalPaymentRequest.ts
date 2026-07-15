import {
	APP_URL,
	ErrPaymentVerification,
	hash,
	validationError,
} from "../../constants";
import {
	DailyOrderStatus,
	getBuyerOrderByIdDB,
	getDailyOrderByIdDB,
	getPaymentByExternalTokenHashDB,
	getVendorProfileByIdDB,
	markBuyerOrderCancelledDB,
	markPaymentCancelledDB,
	markPaymentExpiredDB,
	markPaymentExternalInitializedDB,
	OrderStatus,
	PaymentStatus,
} from "../../models";
import { paystackProvider } from "../../providers";
import { releaseSlots } from "../buyerOrders/slots";
import { ensureReceiptUrl } from "./receipts";

export interface ExternalPaymentSummary {
	status:
		| "AWAITING_EXTERNAL_PAYMENT"
		| "PAID"
		| "EXPIRED"
		| "CANCELLED";
	businessName: string;
	orderNumber: string;
	items: Array<{
		name: string;
		quantity: number;
		subtotalKobo: number;
		selectedOptions: Array<{
			name: string;
			quantity: number;
			subtotalKobo: number;
		}>;
	}>;
	subtotalKobo: number;
	serviceFeeKobo: number;
	totalKobo: number;
	expiresAt?: string;
	paymentDate?: string;
	receiptLink?: string;
}

function tokenHash(token: string): string {
	return hash(token);
}

function isContactEmail(contact: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
}

function payerEmail(contact: string): string {
	if (isContactEmail(contact)) return contact;
	const digits = contact.replace(/\D/g, "");
	return `payer-${digits || "external"}@prechop-pay.ng`;
}

async function resolveRequest(token: string) {
	const payment = await getPaymentByExternalTokenHashDB({
		tokenHash: tokenHash(token),
	});
	if (!payment) throw ErrPaymentVerification;
	const order = await getBuyerOrderByIdDB({
		id: payment.buyerOrderId.toString(),
	});
	if (!order) throw ErrPaymentVerification;
	const vendor = await getVendorProfileByIdDB({
		id: payment.vendorId.toString(),
	});
	if (!vendor) throw ErrPaymentVerification;
	return { payment, order, vendor };
}

async function expireIfNeeded(input: Awaited<ReturnType<typeof resolveRequest>>) {
	const { payment, order } = input;
	if (
		payment.webhookVerified ||
		order.status === OrderStatus.PAID ||
		order.status === OrderStatus.CANCELLED ||
		order.status === OrderStatus.REFUNDED
	) {
		return input;
	}
	const expired =
		!!payment.externalPaymentExpiresAt &&
		payment.externalPaymentExpiresAt.getTime() <= Date.now();
	const dailyOrder = await getDailyOrderByIdDB({
		id: order.dailyOrderId.toString(),
	});
	const orderClosed =
		!dailyOrder ||
		dailyOrder.status === DailyOrderStatus.CLOSED ||
		dailyOrder.status === DailyOrderStatus.CANCELLED;
	if (!expired && !orderClosed) return input;

	await markPaymentExpiredDB({ buyerOrderId: order._id.toString() });
	await markBuyerOrderCancelledDB({
		id: order._id.toString(),
		reason: expired
			? "External payment request expired."
			: "Listing closed before external payment was completed.",
		cancelledBy: "system",
		fromStatuses: [OrderStatus.AWAITING_EXTERNAL_PAYMENT],
	});
	await releaseSlots(
		order.items.map((item) => ({
			dailyOrderItemId: item.dailyOrderItemId.toString(),
			quantity: item.quantity,
		})),
	);
	return {
		...input,
		order: { ...order, status: OrderStatus.CANCELLED },
		payment: { ...payment, status: PaymentStatus.EXPIRED },
	};
}

function statusFor(input: Awaited<ReturnType<typeof resolveRequest>>) {
	if (input.order.status === OrderStatus.PAID || input.payment.webhookVerified)
		return "PAID" as const;
	if (input.order.status === OrderStatus.CANCELLED)
		return input.payment.status === PaymentStatus.EXPIRED
			? ("EXPIRED" as const)
			: ("CANCELLED" as const);
	if (input.payment.status === PaymentStatus.EXPIRED) return "EXPIRED" as const;
	return "AWAITING_EXTERNAL_PAYMENT" as const;
}

export async function getExternalPaymentRequest(
	token: string,
): Promise<ExternalPaymentSummary> {
	const input = await expireIfNeeded(await resolveRequest(token));
	const serviceFeeKobo =
		input.order.paymentProcessingFeeKobo ?? input.order.platformFeeKobo;
	const paid = statusFor(input) === "PAID";
	const receiptLink = paid ? await ensureReceiptUrl(input.order) : undefined;
	return {
		status: paid ? "PAID" : statusFor(input),
		businessName: input.vendor.businessName ?? "Prechop vendor",
		orderNumber: input.order.orderNumber,
		items: input.order.items.map((item) => ({
			name: item.snapshotName,
			quantity: item.quantity,
			subtotalKobo: item.subtotalKobo,
			selectedOptions: item.selectedOptions.map((option) => ({
				name: option.snapshotName,
				quantity: option.quantity,
				subtotalKobo: option.subtotalKobo,
			})),
		})),
		subtotalKobo: input.order.subtotalKobo,
		serviceFeeKobo,
		totalKobo: input.order.totalKobo,
		expiresAt: input.payment.externalPaymentExpiresAt?.toISOString(),
		paymentDate: paid ? input.order.paidAt?.toISOString() : undefined,
		receiptLink,
	};
}

export async function initializeExternalPayment({
	token,
	contact,
}: {
	token: string;
	contact: string;
}): Promise<{ paymentUrl: string; paystackRef: string }> {
	const input = await expireIfNeeded(await resolveRequest(token));
	const status = statusFor(input);
	if (status !== "AWAITING_EXTERNAL_PAYMENT") {
		throw validationError("This payment link is no longer active.");
	}
	if (input.payment.amountKobo !== input.order.totalKobo) {
		await markPaymentExpiredDB({ buyerOrderId: input.order._id.toString() });
		throw validationError("This payment link is no longer valid.");
	}
	if (input.payment.paystackAuthorizationUrl) {
		return {
			paymentUrl: input.payment.paystackAuthorizationUrl,
			paystackRef: input.payment.paystackRef,
		};
	}
	if (!input.vendor.paystackSubaccountCode) {
		throw validationError("Vendor payment account is not configured.");
	}
	const tx = await paystackProvider.initializeTransaction({
		email: payerEmail(contact.trim()),
		amountKobo: input.payment.amountKobo,
		reference: input.payment.paystackRef,
		subaccountCode: input.vendor.paystackSubaccountCode,
		vendorAmountKobo:
			input.payment.vendorSettlementKobo ?? input.payment.vendorAmountKobo,
		callbackUrl: `${APP_URL}/pay/${token}?reference=${input.payment.paystackRef}`,
		metadata: {
			buyerOrderId: input.order._id.toString(),
			dailyOrderId: input.order.dailyOrderId.toString(),
			vendorId: input.order.vendorId.toString(),
			orderNumber: input.order.orderNumber,
			externalPayment: true,
		},
	});
	const updated = await markPaymentExternalInitializedDB({
		paystackRef: input.payment.paystackRef,
		paystackAccessCode: tx.access_code,
		paystackAuthorizationUrl: tx.authorization_url,
	});
	return {
		paymentUrl: updated?.paystackAuthorizationUrl ?? tx.authorization_url,
		paystackRef: input.payment.paystackRef,
	};
}

export async function cancelExternalPaymentRequest({
	buyerId,
	orderId,
	reason,
}: {
	buyerId: string;
	orderId: string;
	reason: string;
}) {
	const order = await getBuyerOrderByIdDB({ id: orderId });
	if (!order || order.buyerId.toString() !== buyerId)
		throw ErrPaymentVerification;
	const cancelled = await markBuyerOrderCancelledDB({
		id: orderId,
		reason,
		cancelledBy: "buyer",
		fromStatuses: [OrderStatus.AWAITING_EXTERNAL_PAYMENT],
	});
	if (!cancelled) {
		throw validationError("This payment request can no longer be cancelled.");
	}
	await markPaymentCancelledDB({ buyerOrderId: orderId });
	await releaseSlots(
		order.items.map((item) => ({
			dailyOrderItemId: item.dailyOrderItemId.toString(),
			quantity: item.quantity,
		})),
	);
	return { message: "Payment request cancelled." };
}
