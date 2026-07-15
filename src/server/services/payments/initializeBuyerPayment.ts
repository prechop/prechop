import {
	ErrPaymentVerification,
	tryDecrypt,
	validationError,
} from "../../constants";
import {
	getBuyerOrderByIdDB,
	getPaymentByOrderIdDB,
	getUserByIdWithPhoneDB,
	getVendorProfileByIdDB,
	markBuyerOrderPendingPaymentDB,
	markPaymentBuyerInitializedDB,
	OrderStatus,
	PaymentStatus,
} from "../../models";
import { paystackProvider } from "../../providers";

function buyerEmailFromPhone(userId: string, encryptedPhone?: string): string {
	const phone = tryDecrypt(encryptedPhone);
	const digits = phone.replace(/\D/g, "");
	return `buyer-${digits || userId}@prechop-orders.ng`;
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
		throw validationError("A payment is already in progress for this order.");
	}
	if (payment.amountKobo !== order.totalKobo) {
		throw validationError("This order payment amount is no longer valid.");
	}
	if (payment.paystackAuthorizationUrl) {
		throw validationError("A payment is already in progress for this order.");
	}

	const [vendor, buyer] = await Promise.all([
		getVendorProfileByIdDB({ id: order.vendorId.toString() }),
		getUserByIdWithPhoneDB({ id: buyerId }),
	]);
	if (!vendor?.paystackSubaccountCode) {
		throw validationError("Vendor payment account is not configured.");
	}

	const tx = await paystackProvider.initializeTransaction({
		email: buyerEmailFromPhone(buyerId, buyer?.phone),
		amountKobo: payment.amountKobo,
		reference: payment.paystackRef,
		subaccountCode: vendor.paystackSubaccountCode,
		vendorAmountKobo: payment.vendorSettlementKobo ?? payment.vendorAmountKobo,
		metadata: {
			buyerOrderId: orderId,
			dailyOrderId: order.dailyOrderId.toString(),
			vendorId: order.vendorId.toString(),
			orderNumber: order.orderNumber,
			foodSubtotalKobo: payment.foodSubtotalKobo ?? order.subtotalKobo,
			deliveryFeeKobo: payment.deliveryFeeKobo ?? order.deliveryFeeKobo,
			paymentProcessingFeeKobo:
				payment.paymentProcessingFeeKobo ?? order.paymentProcessingFeeKobo,
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
		throw validationError("A payment is already in progress for this order.");
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
