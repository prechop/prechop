import { ErrOrderNotFound, validationError } from "../constants";
import {
	createOrderDisputeDB,
	getBuyerOrderByIdDB,
	getPaymentByOrderIdDB,
	type IBuyerOrder,
	type IOrderDispute,
	type IPayment,
	type OrderDisputeReason,
} from "../models";

function asSnapshot(value: unknown): Record<string, unknown> | undefined {
	if (!value) return undefined;
	return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function evidenceFromOrder({
	order,
	payment,
	buyerNotes,
	vendorNotes,
	photos,
	messages,
}: {
	order: IBuyerOrder;
	payment?: IPayment | null;
	buyerNotes?: string[];
	vendorNotes?: string[];
	photos?: string[];
	messages?: unknown[];
}) {
	const orderSnapshot = asSnapshot(order);
	return {
		orderSnapshot,
		menuSnapshot: {
			items: order.items ?? [],
			subtotalKobo: order.subtotalKobo,
			deliveryFeeKobo: order.deliveryFeeKobo,
			totalKobo: order.totalKobo,
		},
		paymentRecord: asSnapshot(payment),
		timeline: order.timeline ?? [],
		qrPinConfirmation: {
			confirmedAt: order.confirmedAt,
			confirmedBy: order.confirmedBy,
			confirmationMethod: order.confirmationMethod,
			confirmationVendorId: order.confirmationVendorId,
			confirmationBuyerId: order.confirmationBuyerId,
			confirmationOrderId: order.confirmationOrderId,
			handoverCredentialCreatedAt: order.handoverCredentialCreatedAt,
			handoverCredentialUsedAt: order.handoverCredentialUsedAt,
			handoverFailedAttempts: order.handoverFailedAttempts,
			handoverLockedUntil: order.handoverLockedUntil,
		},
		messages: [
			...(order.customerMessage
				? [{ from: "buyer", text: order.customerMessage }]
				: []),
			...(order.deliveryAdditionalInfo
				? [
						{
							from: "buyer",
							text: order.deliveryAdditionalInfo,
							context: "delivery",
						},
					]
				: []),
			...(messages ?? []),
		],
		photos: [
			...(order.deliveryEvidencePhotoUrl
				? [order.deliveryEvidencePhotoUrl]
				: []),
			...(photos ?? []),
		],
		vendorNotes: [
			...(order.deliveryFailureNote ? [order.deliveryFailureNote] : []),
			...(vendorNotes ?? []),
		],
		buyerNotes: [
			...(order.pickupProblemNote ? [order.pickupProblemNote] : []),
			...(buyerNotes ?? []),
		],
	};
}

export async function openOrderDisputeForReview({
	orderId,
	reason,
	buyerNotes,
	vendorNotes,
	photos,
	messages,
}: {
	orderId: string;
	reason: OrderDisputeReason;
	buyerNotes?: string[];
	vendorNotes?: string[];
	photos?: string[];
	messages?: unknown[];
}): Promise<IOrderDispute> {
	const order = await getBuyerOrderByIdDB({ id: orderId });
	if (!order) throw ErrOrderNotFound;
	const payment = await getPaymentByOrderIdDB({ buyerOrderId: orderId });
	const dispute = await createOrderDisputeDB({
		payload: {
			buyerOrderId: orderId,
			buyerId: order.buyerId.toString(),
			vendorId: order.vendorId.toString(),
			reason,
			evidence: evidenceFromOrder({
				order,
				payment,
				buyerNotes,
				vendorNotes,
				photos,
				messages,
			}),
		},
	});
	if (!dispute) {
		throw validationError("Could not create the admin review record.");
	}
	return dispute;
}
