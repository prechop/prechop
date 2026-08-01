import { ErrInvalidWebhookSignature } from "../../constants";
import { finalizeSuccessfulPayment } from "./finalizeSuccessfulPayment";

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
	if (event.event !== "charge.success") return { received: true };

	const { reference, amount, channel, status } = event.data;
	if (status !== "success") return { received: true };

	const result = await finalizeSuccessfulPayment({
		reference,
		amountKobo: amount,
		channel,
	});

	return result.alreadyProcessed
		? { received: true }
		: { received: true, orderNumber: result.orderNumber };
}
