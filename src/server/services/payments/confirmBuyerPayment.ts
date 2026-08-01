import { IS_PROD } from "../../constants";
import {
	getBuyerOrderByIdDB,
	getPaymentByRefDB,
	OrderStatus,
	PaymentStatus,
} from "../../models";
import type { IBuyerOrder } from "../../models/buyerOrders/types";
import { paystackProvider } from "../../providers";
import { finalizeSuccessfulPayment } from "./finalizeSuccessfulPayment";

export type BuyerPaymentConfirmStatus =
	| "PAYMENT_CONFIRMED"
	| "PAYMENT_PENDING"
	| "PAYMENT_FAILED"
	| "REFERENCE_NOT_FOUND"
	| "AMOUNT_MISMATCH"
	| "CURRENCY_MISMATCH"
	| "MODE_MISMATCH"
	| "ORDER_STATE_CONFLICT";

export interface BuyerPaymentConfirmResult {
	status: BuyerPaymentConfirmStatus;
	order?: IBuyerOrder;
	retryable?: boolean;
	message?: string;
}

const PAID_ORDER_STATUSES = new Set<string>([
	OrderStatus.PAID,
	OrderStatus.AWAITING_VENDOR_ACCEPTANCE,
	OrderStatus.ACCEPTED,
	OrderStatus.CONFIRMED,
	OrderStatus.COOKING,
	OrderStatus.PREPARING,
	OrderStatus.READY,
	OrderStatus.READY_FOR_PICKUP,
	OrderStatus.READY_FOR_DELIVERY,
	OrderStatus.IN_TRANSIT,
	OrderStatus.PICKED_UP,
	OrderStatus.DELIVERED,
	OrderStatus.COMPLETED,
]);

const CONFLICT_ORDER_STATUSES = new Set<string>([
	OrderStatus.CANCELLED,
	OrderStatus.REFUNDED,
]);

const TERMINAL_UNSUCCESSFUL_PAYSTACK_STATUSES = new Set([
	"failed",
	"abandoned",
	"reversed",
]);

export async function confirmBuyerPaymentByReference({
	buyerId,
	reference,
}: {
	buyerId: string;
	reference: string;
}): Promise<BuyerPaymentConfirmResult> {
	const normalized = reference.trim();
	if (!normalized) {
		return {
			status: "REFERENCE_NOT_FOUND",
			message: "Payment reference was not returned.",
		};
	}

	const payment = await getPaymentByRefDB({ paystackRef: normalized });
	if (!payment || payment.buyerId.toString() !== buyerId) {
		logPaymentConfirm({
			reference: normalized,
			outcome: "REFERENCE_NOT_FOUND",
		});
		return {
			status: "REFERENCE_NOT_FOUND",
			message: "We could not find this payment for your account.",
		};
	}

	const existingOrder = await getBuyerOrderByIdDB({
		id: payment.buyerOrderId.toString(),
	});
	if (!existingOrder || existingOrder.buyerId.toString() !== buyerId) {
		logPaymentConfirm({
			reference: normalized,
			paymentOrderId: payment.buyerOrderId.toString(),
			outcome: "REFERENCE_NOT_FOUND",
		});
		return {
			status: "REFERENCE_NOT_FOUND",
			message: "We could not find this payment for your account.",
		};
	}

	const tx = await verifyPaystackSafely(normalized, existingOrder);
	if (!tx) {
		return {
			status: "PAYMENT_PENDING",
			order: existingOrder,
			retryable: true,
			message: "We could not reach Paystack yet. Please try again.",
		};
	}

	if (tx.reference !== normalized) {
		logPaymentConfirm({
			orderId: existingOrder._id.toString(),
			reference: normalized,
			outcome: "REFERENCE_NOT_FOUND",
			expectedAmountKobo: payment.amountKobo,
			verifiedAmountKobo: tx.amount,
			verifiedStatus: tx.status,
		});
		return {
			status: "REFERENCE_NOT_FOUND",
			order: existingOrder,
			message: "The returned payment reference did not match.",
		};
	}

	if (tx.currency !== "NGN") {
		logPaymentConfirm({
			orderId: existingOrder._id.toString(),
			reference: normalized,
			outcome: "CURRENCY_MISMATCH",
			expectedAmountKobo: payment.amountKobo,
			verifiedAmountKobo: tx.amount,
			verifiedStatus: tx.status,
		});
		return {
			status: "CURRENCY_MISMATCH",
			order: existingOrder,
			message: "The payment currency did not match this order.",
		};
	}

	const expectedDomain = IS_PROD ? "live" : "test";
	if (tx.domain !== expectedDomain) {
		logPaymentConfirm({
			orderId: existingOrder._id.toString(),
			reference: normalized,
			outcome: "MODE_MISMATCH",
			expectedAmountKobo: payment.amountKobo,
			verifiedAmountKobo: tx.amount,
			verifiedStatus: tx.status,
		});
		return {
			status: "MODE_MISMATCH",
			order: existingOrder,
			message: "The payment mode did not match this environment.",
		};
	}

	if (tx.amount !== payment.amountKobo) {
		logPaymentConfirm({
			orderId: existingOrder._id.toString(),
			reference: normalized,
			outcome: "AMOUNT_MISMATCH",
			expectedAmountKobo: payment.amountKobo,
			verifiedAmountKobo: tx.amount,
			verifiedStatus: tx.status,
		});
		return {
			status: "AMOUNT_MISMATCH",
			order: existingOrder,
			message: "The amount Paystack verified did not match your order.",
		};
	}

	const txStatus = tx.status.toLowerCase();
	if (txStatus !== "success") {
		const failed = TERMINAL_UNSUCCESSFUL_PAYSTACK_STATUSES.has(txStatus);
		logPaymentConfirm({
			orderId: existingOrder._id.toString(),
			reference: normalized,
			outcome: failed ? "PAYMENT_FAILED" : "PAYMENT_PENDING",
			expectedAmountKobo: payment.amountKobo,
			verifiedAmountKobo: tx.amount,
			verifiedStatus: tx.status,
		});
		return {
			status: failed ? "PAYMENT_FAILED" : "PAYMENT_PENDING",
			order: existingOrder,
			retryable: !failed,
			message: failed
				? "Paystack says this payment was not successful."
				: "Paystack is still processing this payment.",
		};
	}

	const finalised = await finalizeSuccessfulPayment({
		reference: normalized,
		amountKobo: tx.amount,
		channel: tx.channel,
	});
	const order = finalised.buyerOrderId
		? await getBuyerOrderByIdDB({ id: finalised.buyerOrderId })
		: existingOrder;
	const latestOrder = order ?? existingOrder;
	const outcome =
		finalised.status === "ORDER_STATE_CONFLICT" ||
		CONFLICT_ORDER_STATUSES.has(latestOrder.status)
			? "ORDER_STATE_CONFLICT"
			: PAID_ORDER_STATUSES.has(latestOrder.status) ||
					payment.status === PaymentStatus.SUCCESS
				? "PAYMENT_CONFIRMED"
				: "PAYMENT_PENDING";

	logPaymentConfirm({
		orderId: latestOrder._id.toString(),
		reference: normalized,
		outcome,
		expectedAmountKobo: payment.amountKobo,
		verifiedAmountKobo: tx.amount,
		verifiedStatus: tx.status,
		finalisationStatus: finalised.status,
	});

	if (outcome === "ORDER_STATE_CONFLICT") {
		return {
			status: outcome,
			order: latestOrder,
			message:
				"Paystack confirmed the charge, but the order state needs reconciliation.",
		};
	}

	return {
		status: outcome,
		order: latestOrder,
		retryable: outcome === "PAYMENT_PENDING",
	};
}

async function verifyPaystackSafely(
	reference: string,
	order: IBuyerOrder,
): Promise<{
	status: string;
	reference: string;
	amount: number;
	currency?: string;
	domain?: string;
	channel?: string;
} | null> {
	try {
		return await paystackProvider.verifyTransaction(reference);
	} catch (error) {
		logPaymentConfirm({
			orderId: order._id.toString(),
			reference,
			outcome: "PAYMENT_PENDING",
			finalisationStatus: "verify_error",
		});
		console.warn(
			`[payment-confirm] Paystack verify failed order=${order._id.toString()} ref=${maskReference(reference)}:`,
			error,
		);
		return null;
	}
}

function maskReference(reference: string): string {
	if (reference.length <= 8) return "****";
	return `${reference.slice(0, 4)}...${reference.slice(-4)}`;
}

function logPaymentConfirm({
	orderId,
	paymentOrderId,
	reference,
	outcome,
	expectedAmountKobo,
	verifiedAmountKobo,
	verifiedStatus,
	finalisationStatus,
}: {
	orderId?: string;
	paymentOrderId?: string;
	reference: string;
	outcome: BuyerPaymentConfirmStatus;
	expectedAmountKobo?: number;
	verifiedAmountKobo?: number;
	verifiedStatus?: string;
	finalisationStatus?: string;
}) {
	console.info("[payment-confirm]", {
		orderId,
		paymentOrderId,
		reference: maskReference(reference),
		outcome,
		expectedAmountKobo,
		verifiedAmountKobo,
		verifiedStatus,
		finalisationStatus,
	});
}
