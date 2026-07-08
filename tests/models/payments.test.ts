import { afterAll, beforeAll, describe, expect, it } from "vitest";
import hash from "@/server/constants/hash";
import { generatePaystackRef } from "@/server/constants/orderNumber";
import { PaymentStatus } from "@/server/models/enums";
import {
	claimPaymentWebhookDB,
	createPaymentDB,
	getPaymentByOrderIdDB,
	getPaymentByRefDB,
	markPaymentAbandonedDB,
	markPaymentRefundedDB,
} from "@/server/models/payments";
import { connectTestDB, dropAndDisconnect, oid } from "../helpers/db";

beforeAll(async () => {
	await connectTestDB();
});

afterAll(async () => {
	await dropAndDisconnect();
});

function makePayload(overrides: Record<string, unknown> = {}) {
	const ref = generatePaystackRef();
	return {
		buyerOrderId: oid(),
		buyerId: oid(),
		vendorId: oid(),
		paystackRef: ref,
		amountKobo: 155000,
		platformFeeKobo: 5000,
		vendorAmountKobo: 140000,
		idempotencyKey: hash(ref),
		...overrides,
	};
}

describe("payments model", () => {
	it("creates with INITIALIZED default and reads by ref + order", async () => {
		const payload = makePayload();
		const p = await createPaymentDB({ payload });
		expect(p).not.toBeNull();
		expect(p!.status).toBe(PaymentStatus.INITIALIZED);
		expect(p!.webhookVerified).toBe(false);

		const byRef = await getPaymentByRefDB({
			paystackRef: payload.paystackRef,
		});
		expect(byRef!._id.toString()).toBe(p!._id.toString());
		const byOrder = await getPaymentByOrderIdDB({
			buyerOrderId: payload.buyerOrderId as string,
		});
		expect(byOrder!._id.toString()).toBe(p!._id.toString());
	});

	it("claimPaymentWebhookDB: first claim flips webhookVerified, second is a no-op", async () => {
		const payload = makePayload();
		await createPaymentDB({ payload });

		const first = await claimPaymentWebhookDB({
			paystackRef: payload.paystackRef,
			channel: "card",
		});
		expect(first).not.toBeNull();
		expect(first!.webhookVerified).toBe(true);
		expect(first!.status).toBe(PaymentStatus.SUCCESS);
		expect(first!.channel).toBe("card");

		// idempotent: the guard {webhookVerified:false} no longer matches
		const second = await claimPaymentWebhookDB({
			paystackRef: payload.paystackRef,
			channel: "card",
		});
		expect(second).toBeNull();
	});

	it("marks refunded and abandoned", async () => {
		const refundPayload = makePayload();
		await createPaymentDB({ payload: refundPayload });
		expect(
			await markPaymentRefundedDB({
				buyerOrderId: refundPayload.buyerOrderId as string,
			}),
		).toBe(true);
		const refunded = await getPaymentByRefDB({
			paystackRef: refundPayload.paystackRef,
		});
		expect(refunded!.status).toBe(PaymentStatus.REFUNDED);

		const abandonPayload = makePayload();
		await createPaymentDB({ payload: abandonPayload });
		expect(
			await markPaymentAbandonedDB({
				buyerOrderId: abandonPayload.buyerOrderId as string,
			}),
		).toBe(true);
		const abandoned = await getPaymentByRefDB({
			paystackRef: abandonPayload.paystackRef,
		});
		expect(abandoned!.status).toBe(PaymentStatus.ABANDONED);
	});

	it("does not abandon a webhook-verified payment", async () => {
		const payload = makePayload();
		await createPaymentDB({ payload });
		await claimPaymentWebhookDB({ paystackRef: payload.paystackRef });
		// guard requires webhookVerified:false → no update
		expect(
			await markPaymentAbandonedDB({
				buyerOrderId: payload.buyerOrderId as string,
			}),
		).toBe(false);
	});
});
