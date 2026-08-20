import { NODE_ENV } from "../../constants";
import {
	getBuyerOrderByIdDB,
	getPaymentByRefDB,
	OrderStatus,
	PaymentStatus,
	SETTLED_ORDER_STATUSES,
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

const PAID_ORDER_STATUSES = new Set<string>(SETTLED_ORDER_STATUSES);

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
			reasonCode: "PAYMENT_NOT_FOUND_OR_WRONG_BUYER",
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
			reasonCode: "ORDER_NOT_FOUND_OR_WRONG_BUYER",
			paymentStatus: payment.status,
			webhookFinalised: payment.webhookVerified,
		});
		return {
			status: "REFERENCE_NOT_FOUND",
			message: "We could not find this payment for your account.",
		};
	}

	const diagnostics = {
		paymentStatus: payment.status,
		orderStatus: existingOrder.status,
		webhookFinalised: payment.webhookVerified,
	};
	const tx = await verifyPaystackSafely(
		normalized,
		existingOrder,
		diagnostics,
	);
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
			...diagnostics,
			orderId: existingOrder._id.toString(),
			reference: normalized,
			outcome: "REFERENCE_NOT_FOUND",
			reasonCode: "PAYSTACK_REFERENCE_MISMATCH",
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
			...diagnostics,
			orderId: existingOrder._id.toString(),
			reference: normalized,
			outcome: "CURRENCY_MISMATCH",
			reasonCode: "PAYSTACK_CURRENCY_MISMATCH",
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

	const expectedDomain = expectedPaystackDomain();
	if (tx.domain !== expectedDomain) {
		logPaymentConfirm({
			...diagnostics,
			orderId: existingOrder._id.toString(),
			reference: normalized,
			outcome: "MODE_MISMATCH",
			reasonCode: "PAYSTACK_MODE_MISMATCH",
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
			...diagnostics,
			orderId: existingOrder._id.toString(),
			reference: normalized,
			outcome: "AMOUNT_MISMATCH",
			reasonCode: "PAYSTACK_AMOUNT_MISMATCH",
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
			...diagnostics,
			orderId: existingOrder._id.toString(),
			reference: normalized,
			outcome: failed ? "PAYMENT_FAILED" : "PAYMENT_PENDING",
			reasonCode: failed
				? "PAYSTACK_TERMINAL_FAILURE"
				: "PAYSTACK_STILL_PROCESSING",
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
	const latestPayment =
		(await getPaymentByRefDB({ paystackRef: normalized })) ?? payment;
	const classification = classifyPaymentConfirmationOutcome({
		finalisationStatus: finalised.status,
		orderStatus: latestOrder.status,
		paymentStatus: latestPayment.status,
	});
	const outcome = classification.status;

	logPaymentConfirm({
		orderId: latestOrder._id.toString(),
		reference: normalized,
		outcome,
		reasonCode: classification.reasonCode,
		paymentStatus: latestPayment.status,
		orderStatus: latestOrder.status,
		webhookFinalised: latestPayment.webhookVerified,
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
	diagnostics: {
		paymentStatus: PaymentStatus;
		orderStatus: OrderStatus;
		webhookFinalised: boolean;
	},
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
			...diagnostics,
			orderId: order._id.toString(),
			reference,
			outcome: "PAYMENT_PENDING",
			reasonCode: "PAYSTACK_VERIFY_UNAVAILABLE",
			finalisationStatus: "verify_error",
		});
		console.warn(
			`[payment-confirm] Paystack verify failed order=${order._id.toString()} ref=${maskReference(reference)}:`,
			error instanceof Error
				? { name: error.name, message: error.message }
				: { name: "UnknownError" },
		);
		return null;
	}
}

export function expectedPaystackDomain(
	environment = NODE_ENV,
): "live" | "test" {
	return environment === "production" ? "live" : "test";
}

export function classifyPaymentConfirmationOutcome({
	finalisationStatus,
	orderStatus,
	paymentStatus,
}: {
	finalisationStatus:
		| "PAYMENT_CONFIRMED"
		| "PAYMENT_ALREADY_CONFIRMED"
		| "ORDER_STATE_CONFLICT";
	orderStatus: OrderStatus;
	paymentStatus: PaymentStatus;
}): {
	status: Extract<
		BuyerPaymentConfirmStatus,
		"PAYMENT_CONFIRMED" | "PAYMENT_PENDING" | "ORDER_STATE_CONFLICT"
	>;
	reasonCode: string;
} {
	if (CONFLICT_ORDER_STATUSES.has(orderStatus)) {
		return {
			status: "ORDER_STATE_CONFLICT",
			reasonCode: "TERMINAL_ORDER_STATUS",
		};
	}
	// The re-read order is authoritative. A webhook may have completed while the
	// callback was verifying, so a valid paid state must beat a stale conflict
	// result from the concurrent finalisation attempt.
	if (PAID_ORDER_STATUSES.has(orderStatus)) {
		return {
			status: "PAYMENT_CONFIRMED",
			reasonCode: "VALID_PAID_ORDER_STATUS",
		};
	}
	if (finalisationStatus === "ORDER_STATE_CONFLICT") {
		return {
			status: "ORDER_STATE_CONFLICT",
			reasonCode: "FINALISATION_FAILED",
		};
	}
	if (paymentStatus === PaymentStatus.SUCCESS) {
		return {
			status: "PAYMENT_CONFIRMED",
			reasonCode: "PAYMENT_RECORD_SUCCESS",
		};
	}
	return {
		status: "PAYMENT_PENDING",
		reasonCode: "FINALISATION_PENDING",
	};
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
	reasonCode,
	paymentStatus,
	orderStatus,
	webhookFinalised,
}: {
	orderId?: string;
	paymentOrderId?: string;
	reference: string;
	outcome: BuyerPaymentConfirmStatus;
	expectedAmountKobo?: number;
	verifiedAmountKobo?: number;
	verifiedStatus?: string;
	finalisationStatus?: string;
	reasonCode: string;
	paymentStatus?: PaymentStatus;
	orderStatus?: OrderStatus;
	webhookFinalised?: boolean;
}) {
	console.info("[payment-confirm]", {
		orderId,
		paymentOrderId,
		reference: maskReference(reference),
		outcome,
		reasonCode,
		paymentStatus,
		orderStatus,
		webhookFinalised,
		expectedAmountKobo,
		verifiedAmountKobo,
		verifiedStatus,
		finalisationStatus,
	});
}
