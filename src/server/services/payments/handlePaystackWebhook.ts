import { ErrInvalidWebhookSignature } from "../../constants";
import { handleRefundWebhook } from "../refunds";
import { finalizeSuccessfulPayment } from "./finalizeSuccessfulPayment";
import { applyPaystackTransferState, type PaystackTransferEvent } from "../vendorPayouts";
import {
	BrandKitPaymentStatus,
	getVendorProfileByBrandKitPaymentIdDB,
	updateVendorProfileDB,
} from "../../models";

interface PaystackChargeEvent {
	event: string;
	data: {
		reference: string;
		amount: number;
		requested_amount?: number;
		channel: string;
		status: string;
	};
}

export async function handlePaystackWebhook({
	rawBody,
	signature,
}: {
	rawBody: string;
	signature: string | undefined;
}): Promise<{ received: boolean; orderNumber?: string }> {
	const { paystackProvider } = await import("../../providers");
	if (!paystackProvider.verifyWebhookSignature(rawBody, signature)) {
		throw ErrInvalidWebhookSignature;
	}

	const event = JSON.parse(rawBody) as PaystackChargeEvent;
	if (event.event.startsWith("transfer.")) {
		if (["transfer.success", "transfer.failed", "transfer.reversed"].includes(event.event)) {
			await applyPaystackTransferState(event as unknown as PaystackTransferEvent);
		}
		return { received: true };
	}
	if (event.event.startsWith("refund.")) {
		await handleRefundWebhook(event);
		return { received: true };
	}
	if (event.event !== "charge.success") return { received: true };

	const { reference, amount, channel, status } = event.data;
	if (status !== "success") return { received: true };

	const brandKitVendor = await getVendorProfileByBrandKitPaymentIdDB({
		paymentId: reference,
	});
	if (brandKitVendor) {
		await updateVendorProfileDB({
			id: brandKitVendor._id.toString(),
			payload: {
				brandKitPaymentStatus: BrandKitPaymentStatus.PAID,
				brandKitPaidAt: new Date(),
			},
		});
		return { received: true };
	}

	const result = await finalizeSuccessfulPayment({
		reference,
		amountKobo: amount,
		channel,
	});

	return result.alreadyProcessed
		? { received: true }
		: { received: true, orderNumber: result.orderNumber };
}
