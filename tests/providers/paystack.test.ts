import { describe, expect, it } from "vitest";
import { PaymentSettlementMode } from "@/server/models";
import {
	buildInitializePayload,
	isSeedPlaceholderSubaccount,
} from "@/server/providers/paystack";

const baseInput = {
	email: "buyer@example.com",
	amountKobo: 255000,
	reference: "PCH-TEST-0001",
	subaccountCode: "ACCT_realvendor123",
	vendorAmountKobo: 240000,
	metadata: { orderNumber: "PCH-2026-000001" },
};

describe("isSeedPlaceholderSubaccount", () => {
	it("flags seed placeholder codes", () => {
		expect(isSeedPlaceholderSubaccount("ACCT_seeddemo0001")).toBe(true);
		expect(isSeedPlaceholderSubaccount("ACCT_seedpending01")).toBe(true);
	});

	it("does not flag real Paystack subaccount codes", () => {
		expect(isSeedPlaceholderSubaccount("ACCT_realvendor123")).toBe(false);
		expect(isSeedPlaceholderSubaccount("ACCT_8f4s1eq7ml6rlzj")).toBe(false);
	});
});

describe("buildInitializePayload", () => {
	it("includes the split (subaccount + transaction_charge) for a real subaccount", () => {
		const payload = buildInitializePayload(baseInput, {
			allowUnsplit: true,
		});
		expect(payload).toMatchObject({
			email: baseInput.email,
			amount: baseInput.amountKobo,
			reference: baseInput.reference,
			subaccount: baseInput.subaccountCode,
			transaction_charge: 15000, // amountKobo - vendorAmountKobo
			bearer: "account",
		});
	});

	it("drops the split for a seed placeholder when unsplit is allowed (dev)", () => {
		const payload = buildInitializePayload(
			{ ...baseInput, subaccountCode: "ACCT_seeddemo0001" },
			{ allowUnsplit: true },
		);
		expect(payload).not.toHaveProperty("subaccount");
		expect(payload).not.toHaveProperty("transaction_charge");
		expect(payload).not.toHaveProperty("bearer");
		// Core charge fields still present.
		expect(payload).toMatchObject({
			email: baseInput.email,
			amount: baseInput.amountKobo,
			reference: baseInput.reference,
		});
	});

	it("keeps the split for a seed placeholder in production (surfaces the bad data)", () => {
		const payload = buildInitializePayload(
			{ ...baseInput, subaccountCode: "ACCT_seeddemo0001" },
			{ allowUnsplit: false },
		);
		expect(payload).toMatchObject({
			subaccount: "ACCT_seeddemo0001",
			transaction_charge: 15000,
			bearer: "account",
		});
	});

	it("omits every split parameter only for an explicitly classified V2 payment", () => {
		const payload = buildInitializePayload(
			{
				...baseInput,
				settlementMode:
					PaymentSettlementMode.PLATFORM_BALANCE_TRANSFER_V2,
				subaccountCode: undefined,
			},
			{ allowUnsplit: false },
		);
		expect(payload).not.toHaveProperty("subaccount");
		expect(payload).not.toHaveProperty("transaction_charge");
		expect(payload).not.toHaveProperty("bearer");
	});

	it("refuses an unsplit V1 initialization", () => {
		expect(() =>
			buildInitializePayload(
				{
					...baseInput,
					settlementMode: PaymentSettlementMode.DIRECT_SUBACCOUNT_V1,
					subaccountCode: undefined,
				},
				{ allowUnsplit: false },
			),
		).toThrow(/requires a subaccount/);
	});
});
