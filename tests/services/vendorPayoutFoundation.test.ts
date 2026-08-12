import mongoose from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	assertPayoutV2FoundationEnabled,
	assertPayoutV2MoneyMovementEnabled,
	isPayoutV2FoundationEnabled,
	isPayoutV2MoneyMovementAllowed,
} from "@/server/constants";
import {
	claimVendorPayableForPayoutDB,
	createPaymentDB,
	createPayoutDraftOnceDB,
	createPayoutLineOnceDB,
	createVendorPayableOnceDB,
	createVendorTransferRecipientRecordOnceDB,
	getPaymentByOrderIdDB,
	OrderStatus,
	Payment,
	PaymentSettlementMode,
	PaymentStatus,
	Payout,
	PayoutLine,
	VendorPayable,
	VendorTransferRecipient,
} from "@/server/models";
import {
	evaluatePayoutEligibility,
	PAYOUT_GRACE_PERIOD_MS,
	type PayoutEligibilityInput,
} from "@/server/services/vendorPayouts";
import { connectTestDB, dropAndDisconnect, oid } from "../helpers/db";

beforeAll(async () => {
	await connectTestDB();
	await Promise.all([
		Payment.syncIndexes(),
		VendorPayable.syncIndexes(),
		Payout.syncIndexes(),
		PayoutLine.syncIndexes(),
		VendorTransferRecipient.syncIndexes(),
	]);
});

afterAll(async () => {
	await dropAndDisconnect();
});

function eligibleInput(): PayoutEligibilityInput {
	const now = new Date("2026-08-11T12:00:00.000Z");
	const trustedCompletionAt = new Date(
		now.getTime() - PAYOUT_GRACE_PERIOD_MS,
	);
	const orderId = oid();
	const vendorId = oid();
	return {
		v2Enabled: true,
		now,
		payment: {
			id: oid(),
			buyerOrderId: orderId,
			vendorId,
			settlementMode: PaymentSettlementMode.PLATFORM_BALANCE_TRANSFER_V2,
			status: PaymentStatus.SUCCESS,
			webhookVerified: true,
			paidAt: new Date("2026-08-08T10:00:00.000Z"),
		},
		order: {
			id: orderId,
			vendorId,
			status: OrderStatus.COMPLETED,
		},
		trustedCompletion: {
			trustedCompletionAt,
			confirmationMethod: "PIN",
			confirmationReference: `order-confirmation:${orderId}`,
		},
		activeDisputeIds: [] as string[],
		refund: null,
		payoutHold: null,
		recipient: {
			id: oid(),
			vendorId,
			version: 1,
			status: "ACTIVE",
			verifiedAt: new Date("2026-08-01T10:00:00.000Z"),
		},
	};
}

async function createV2PaymentFixture({
	paymentId = oid(),
	buyerOrderId,
	vendorId,
	vendorAmountKobo,
}: {
	paymentId?: string;
	buyerOrderId: string;
	vendorId: string;
	vendorAmountKobo: number;
}) {
	return Payment.create({
		_id: new mongoose.Types.ObjectId(paymentId),
		buyerOrderId: new mongoose.Types.ObjectId(buyerOrderId),
		buyerId: new mongoose.Types.ObjectId(oid()),
		vendorId: new mongoose.Types.ObjectId(vendorId),
		paystackRef: `v2-fixture-${oid()}`,
		amountKobo: vendorAmountKobo + 2_000,
		platformFeeKobo: 2_000,
		vendorAmountKobo,
		settlementMode: PaymentSettlementMode.PLATFORM_BALANCE_TRANSFER_V2,
		status: PaymentStatus.SUCCESS,
		webhookVerified: true,
		paidAt: new Date("2026-08-09T10:00:00.000Z"),
		idempotencyKey: `v2-fixture-key-${oid()}`,
	});
}

describe("V2 feature safety", () => {
	it("keeps money movement locked in the foundation test environment", () => {
		expect(() => assertPayoutV2FoundationEnabled()).not.toThrow();
		expect(() => assertPayoutV2MoneyMovementEnabled()).toThrow(/locked/);
		expect(
			isPayoutV2FoundationEnabled({
				foundationEnabled: false,
				paystackManualPayoutsApproved: false,
				moneyMovementEnabled: false,
				legalAccountingApproved: false,
			}),
		).toBe(false);
	});

	it("requires all three independent money-movement conditions", () => {
		expect(
			isPayoutV2MoneyMovementAllowed({
				foundationEnabled: true,
				paystackManualPayoutsApproved: true,
				moneyMovementEnabled: true,
				legalAccountingApproved: true,
			}),
		).toBe(true);
		for (const state of [
			{
				foundationEnabled: false,
				paystackManualPayoutsApproved: true,
				moneyMovementEnabled: true,
				legalAccountingApproved: true,
			},
			{
				foundationEnabled: true,
				paystackManualPayoutsApproved: false,
				moneyMovementEnabled: true,
				legalAccountingApproved: true,
			},
			{
				foundationEnabled: true,
				paystackManualPayoutsApproved: true,
				moneyMovementEnabled: false,
				legalAccountingApproved: true,
			},
			{
				foundationEnabled: true,
				paystackManualPayoutsApproved: true,
				moneyMovementEnabled: true,
				legalAccountingApproved: false,
			},
		]) {
			expect(isPayoutV2MoneyMovementAllowed(state)).toBe(false);
		}
	});
});

describe("settlement-mode isolation and classification", () => {
	it("classifies a historical payment with no stored mode as V1", async () => {
		const buyerOrderId = oid();
		await Payment.collection.insertOne({
			buyerOrderId: new mongoose.Types.ObjectId(buyerOrderId),
			buyerId: new mongoose.Types.ObjectId(oid()),
			vendorId: new mongoose.Types.ObjectId(oid()),
			paystackRef: `legacy-${oid()}`,
			amountKobo: 10_000,
			platformFeeKobo: 500,
			vendorAmountKobo: 9_000,
			status: PaymentStatus.SUCCESS,
			webhookVerified: true,
			idempotencyKey: `legacy-key-${oid()}`,
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		const payment = await getPaymentByOrderIdDB({ buyerOrderId });
		expect(payment?.settlementMode).toBe(
			PaymentSettlementMode.DIRECT_SUBACCOUNT_V1,
		);
	});

	it("persists new existing-flow payments explicitly as V1", async () => {
		const payment = await createPaymentDB({
			payload: {
				buyerOrderId: oid(),
				buyerId: oid(),
				vendorId: oid(),
				paystackRef: `v1-${oid()}`,
				amountKobo: 20_000,
				platformFeeKobo: 1_000,
				vendorAmountKobo: 18_000,
				idempotencyKey: `v1-key-${oid()}`,
			},
		});
		expect(payment?.settlementMode).toBe(
			PaymentSettlementMode.DIRECT_SUBACCOUNT_V1,
		);
	});

	it("refuses to create a VendorPayable for a V1 payment mode", async () => {
		const when = new Date();
		const payable = await createVendorPayableOnceDB({
			payload: {
				buyerOrderId: oid(),
				paymentId: oid(),
				vendorId: oid(),
				amountKobo: 10_000,
				settlementMode: PaymentSettlementMode.DIRECT_SUBACCOUNT_V1,
				trustedCompletionAt: when,
				payoutEligibleAt: when,
				eligibilityEvidence: {
					confirmationMethod: "PIN",
					paymentVerifiedAt: when,
					evaluatedAt: when,
					evaluatorVersion: "test",
				},
				idempotencyKey: `v1-payable-${oid()}`,
			},
		});
		expect(payable).toBeNull();
	});
});

describe("central payout eligibility", () => {
	it("does not treat COMPLETED alone as eligible", () => {
		const input = eligibleInput();
		input.trustedCompletion = {} as typeof input.trustedCompletion;
		expect(evaluatePayoutEligibility(input).reason).toBe(
			"TRUSTED_COMPLETION_MISSING",
		);
	});

	it("accepts only a verified V2 payment after grace with trusted evidence", () => {
		const outcome = evaluatePayoutEligibility(eligibleInput());
		expect(outcome.eligible).toBe(true);
		expect(outcome.reason).toBe("ELIGIBLE");
		expect(outcome.payoutEligibleAt?.toISOString()).toBe(
			"2026-08-11T12:00:00.000Z",
		);
	});

	it.each([
		[
			"disabled feature",
			(x: PayoutEligibilityInput): void => {
				x.v2Enabled = false;
			},
			"FEATURE_DISABLED",
		],
		[
			"V1 payment",
			(x: PayoutEligibilityInput): void => {
				x.payment.settlementMode =
					PaymentSettlementMode.DIRECT_SUBACCOUNT_V1;
			},
			"SETTLEMENT_MODE_NOT_V2",
		],
		[
			"unverified payment",
			(x: PayoutEligibilityInput): void => {
				x.payment.webhookVerified = false;
			},
			"PAYMENT_NOT_VERIFIED",
		],
		[
			"active dispute",
			(x: PayoutEligibilityInput): void => {
				x.activeDisputeIds.push(oid());
			},
			"OPEN_DISPUTE",
		],
		[
			"refund",
			(x: PayoutEligibilityInput): void => {
				x.refund = { id: oid(), status: "REFUND_PENDING" };
			},
			"REFUND_BLOCKING",
		],
		[
			"order hold",
			(x: PayoutEligibilityInput): void => {
				x.payoutHold = { active: true };
			},
			"PAYOUT_HOLD_ACTIVE",
		],
		[
			"retired recipient",
			(x: PayoutEligibilityInput): void => {
				if (x.recipient) x.recipient.status = "RETIRED";
			},
			"RECIPIENT_NOT_ACTIVE",
		],
	] as const)("blocks %s", (_label, mutate, reason) => {
		const input = eligibleInput();
		mutate(input);
		expect(evaluatePayoutEligibility(input).reason).toBe(reason);
	});

	it("blocks until the full 24-hour grace has elapsed", () => {
		const input = eligibleInput();
		input.now = new Date(input.now.getTime() - 1);
		expect(evaluatePayoutEligibility(input).reason).toBe(
			"GRACE_PERIOD_ACTIVE",
		);
	});
});

describe("database duplicate prevention", () => {
	it("creates one immutable payable per payment and does not rewrite it", async () => {
		const paymentId = oid();
		const buyerOrderId = oid();
		const vendorId = oid();
		const at = new Date("2026-08-10T10:00:00.000Z");
		await createV2PaymentFixture({
			paymentId,
			buyerOrderId,
			vendorId,
			vendorAmountKobo: 25_000,
		});
		const base = {
			buyerOrderId,
			paymentId,
			vendorId,
			amountKobo: 25_000,
			settlementMode: PaymentSettlementMode.PLATFORM_BALANCE_TRANSFER_V2,
			trustedCompletionAt: at,
			payoutEligibleAt: new Date(at.getTime() + PAYOUT_GRACE_PERIOD_MS),
			eligibilityEvidence: {
				confirmationMethod: "QR" as const,
				paymentVerifiedAt: at,
				evaluatedAt: new Date(),
				evaluatorVersion: "test",
			},
			idempotencyKey: `payable-${paymentId}`,
		};
		const first = await createVendorPayableOnceDB({ payload: base });
		const retry = await createVendorPayableOnceDB({ payload: base });
		const tamperedRetry = await createVendorPayableOnceDB({
			payload: { ...base, amountKobo: 999_999 },
		});
		expect(first?.created).toBe(true);
		expect(retry?.created).toBe(false);
		expect(retry?._id.toString()).toBe(first?._id.toString());
		expect(retry?.amountKobo).toBe(25_000);
		expect(tamperedRetry).toBeNull();
	});

	it("creates one immutable payout line per payable/order/payment", async () => {
		const orderId = oid();
		const paymentId = oid();
		const vendorId = oid();
		const trustedCompletionAt = new Date("2026-08-10T10:00:00.000Z");
		await createV2PaymentFixture({
			paymentId,
			buyerOrderId: orderId,
			vendorId,
			vendorAmountKobo: 12_000,
		});
		const payable = await createVendorPayableOnceDB({
			payload: {
				buyerOrderId: orderId,
				paymentId,
				vendorId,
				amountKobo: 12_000,
				settlementMode:
					PaymentSettlementMode.PLATFORM_BALANCE_TRANSFER_V2,
				trustedCompletionAt,
				payoutEligibleAt: new Date(
					trustedCompletionAt.getTime() + PAYOUT_GRACE_PERIOD_MS,
				),
				eligibilityEvidence: {
					confirmationMethod: "PIN",
					paymentVerifiedAt: new Date("2026-08-09T10:00:00.000Z"),
					evaluatedAt: new Date(),
					evaluatorVersion: "test",
				},
				idempotencyKey: `line-payable-${paymentId}`,
				initialStatus: "ELIGIBLE",
			},
		});
		expect(payable).not.toBeNull();
		if (!payable) throw new Error("V2 payable fixture was not created");
		const payableId = payable._id.toString();
		const payoutId = oid();
		await claimVendorPayableForPayoutDB({ id: payableId, payoutId });
		const first = await createPayoutLineOnceDB({
			payload: {
				payoutId,
				vendorPayableId: payableId,
				buyerOrderId: orderId,
				paymentId,
				vendorId,
				settlementMode:
					PaymentSettlementMode.PLATFORM_BALANCE_TRANSFER_V2,
				amountKobo: 12_000,
				idempotencyKey: `line-${payableId}`,
			},
		});
		const retry = await createPayoutLineOnceDB({
			payload: {
				payoutId,
				vendorPayableId: payableId,
				buyerOrderId: orderId,
				paymentId,
				vendorId,
				settlementMode:
					PaymentSettlementMode.PLATFORM_BALANCE_TRANSFER_V2,
				amountKobo: 12_000,
				idempotencyKey: `different-${oid()}`,
			},
		});
		expect(first?.created).toBe(true);
		expect(retry?.created).toBe(false);
		expect(retry?._id.toString()).toBe(first?._id.toString());
		expect(retry?.amountKobo).toBe(12_000);
		const tamperedRetry = await createPayoutLineOnceDB({
			payload: {
				payoutId,
				vendorPayableId: payableId,
				buyerOrderId: orderId,
				paymentId,
				vendorId,
				settlementMode:
					PaymentSettlementMode.PLATFORM_BALANCE_TRANSFER_V2,
				amountKobo: 99_000,
				idempotencyKey: `tampered-${oid()}`,
			},
		});
		expect(tamperedRetry).toBeNull();
	});

	it("versions recipient snapshots and permits only one active recipient", async () => {
		const vendorId = oid();
		const first = await createVendorTransferRecipientRecordOnceDB({
			payload: {
				vendorId,
				version: 1,
				paystackRecipientCode: `RCP_${oid()}`,
				bankCode: "058",
				bankName: "Test Bank",
				accountName: "Test Vendor",
				accountNumberEncrypted: "encrypted-test-value",
				accountNumberLast4: "1234",
				verifiedAt: new Date(),
				idempotencyKey: `recipient-${oid()}`,
			},
		});
		expect(first?.created).toBe(true);
		expect(first?.status).toBe("ACTIVE");
		expect(first?.auditHistory.at(0)?.action).toBe("VERIFIED");

		const secondActive = await createVendorTransferRecipientRecordOnceDB({
			payload: {
				vendorId,
				version: 2,
				paystackRecipientCode: `RCP_${oid()}`,
				bankCode: "044",
				bankName: "Other Test Bank",
				accountName: "Test Vendor",
				accountNumberEncrypted: "other-encrypted-test-value",
				accountNumberLast4: "5678",
				verifiedAt: new Date(),
				idempotencyKey: `recipient-${oid()}`,
			},
		});
		expect(secondActive).toBeNull();
	});

	it("creates payout drafts idempotently without transfer data", async () => {
		const vendorId = oid();
		const recipientId = oid();
		const key = `payout-${oid()}`;
		const payload = {
			vendorId,
			settlementMode: PaymentSettlementMode.PLATFORM_BALANCE_TRANSFER_V2,
			currency: "NGN" as const,
			totalAmountKobo: 100_000,
			transferFeeKobo: 0,
			stampDutyKobo: 0,
			recipientSnapshot: {
				recipientId,
				recipientVersion: 1,
				paystackRecipientCode: `RCP_${oid()}`,
				bankCode: "058",
				bankName: "Test Bank",
				accountName: "Test Vendor",
				accountNumberLast4: "1234",
				verifiedAt: new Date(),
			},
			idempotencyKey: key,
		};
		const first = await createPayoutDraftOnceDB({ payload });
		const retry = await createPayoutDraftOnceDB({
			payload: { ...payload, totalAmountKobo: 999_999 },
		});
		expect(first?.created).toBe(true);
		expect(first?.status).toBe("DRAFT");
		expect(first?.paystackTransferCode).toBeUndefined();
		expect(retry?.created).toBe(false);
		expect(retry?.totalAmountKobo).toBe(100_000);
	});
});
