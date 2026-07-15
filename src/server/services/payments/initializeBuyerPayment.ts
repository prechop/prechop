import { ErrPaymentVerification, validationError } from "../../constants";
import {
	getBuyerOrderByIdDB,
	getPaymentByOrderIdDB,
	getVendorProfileByIdDB,
	markBuyerOrderPendingPaymentDB,
	markPaymentBuyerInitializedDB,
	OrderStatus,
	PaymentStatus,
} from "../../models";
import { paystackProvider } from "../../providers";

/**
 * Paystack requires an email per transaction, but Prechop buyers authenticate by
 * phone and have none. We send an opaque, non-identifying synthetic address keyed
 * ONLY on the internal userId — never the buyer's phone number. Shipping the
 * decrypted E.164 phone here would cross a real identifier to Paystack in clear,
 * defeating encrypt-at-rest and NDPA data-minimisation. Mirrors the address used
 * by the payment-request path in `buyerOrders/placeOrder`.
 */
function buyerPaystackEmail(userId: string): string {
	return `buyer-${userId}@prechop-orders.ng`;
}

export async function initializeBuyerPayment({
	buyerId,
	orderId,
}: {
	buyerId: string;
	orderId: string;
}): Promise<{
	buyerOrderId: string;
	orderNumber: string;
	paymentUrl: string;
	accessCode?: string;
	paystackRef: string;
}> {
	const order = await getBuyerOrderByIdDB({ id: orderId });
	if (!order || order.buyerId.toString() !== buyerId) {
		throw ErrPaymentVerification;
	}
	if (
		order.status !== OrderStatus.AWAITING_EXTERNAL_PAYMENT &&
		order.status !== OrderStatus.PENDING_PAYMENT
	) {
		throw validationError("This order can no longer be paid.");
	}

	const payment = await getPaymentByOrderIdDB({ buyerOrderId: orderId });
	if (!payment || payment.webhookVerified) {
		throw validationError("This order can no longer be paid.");
	}
	if (
		payment.status === PaymentStatus.INITIALIZED &&
		payment.paystackAuthorizationUrl &&
		!payment.externalPaymentTokenHash
	) {
		return {
			buyerOrderId: orderId,
			orderNumber: order.orderNumber,
			paymentUrl: payment.paystackAuthorizationUrl,
			accessCode: payment.paystackAccessCode,
			paystackRef: payment.paystackRef,
		};
	}
	if (payment.status !== PaymentStatus.AWAITING_EXTERNAL_PAYMENT) {
		throw validationError(
			"A payment is already in progress for this order.",
		);
	}
	if (payment.amountKobo !== order.totalKobo) {
		throw validationError("This order payment amount is no longer valid.");
	}
	if (payment.paystackAuthorizationUrl) {
		throw validationError(
			"A payment is already in progress for this order.",
		);
	}

	const vendor = await getVendorProfileByIdDB({
		id: order.vendorId.toString(),
	});
	if (!vendor?.paystackSubaccountCode) {
		throw validationError("Vendor payment account is not configured.");
	}

	const tx = await paystackProvider.initializeTransaction({
		email: buyerPaystackEmail(buyerId),
		amountKobo: payment.amountKobo,
		reference: payment.paystackRef,
		subaccountCode: vendor.paystackSubaccountCode,
		vendorAmountKobo:
			payment.vendorSettlementKobo ?? payment.vendorAmountKobo,
		metadata: {
			buyerOrderId: orderId,
			dailyOrderId: order.dailyOrderId.toString(),
			vendorId: order.vendorId.toString(),
			orderNumber: order.orderNumber,
			foodSubtotalKobo: payment.foodSubtotalKobo ?? order.subtotalKobo,
			deliveryFeeKobo: payment.deliveryFeeKobo ?? order.deliveryFeeKobo,
			paymentProcessingFeeKobo:
				payment.paymentProcessingFeeKobo ??
				order.paymentProcessingFeeKobo,
			prechopCommissionKobo:
				payment.prechopCommissionKobo ?? order.prechopCommissionKobo,
			vendorSettlementKobo:
				payment.vendorSettlementKobo ?? order.vendorSettlementKobo,
		},
	});

	const updated = await markPaymentBuyerInitializedDB({
		buyerOrderId: orderId,
		paystackAccessCode: tx.access_code,
		paystackAuthorizationUrl: tx.authorization_url,
	});
	if (!updated) {
		throw validationError(
			"A payment is already in progress for this order.",
		);
	}
	await markBuyerOrderPendingPaymentDB({ id: orderId });

	return {
		buyerOrderId: orderId,
		orderNumber: order.orderNumber,
		paymentUrl: updated.paystackAuthorizationUrl ?? tx.authorization_url,
		accessCode: updated.paystackAccessCode ?? tx.access_code,
		paystackRef: updated.paystackRef,
	};
}
