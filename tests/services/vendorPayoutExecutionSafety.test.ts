import { describe, expect, it } from "vitest";
import { assertPayoutV2MoneyMovementEnabled } from "@/server/constants";
import { calculatePaystackTransferCosts } from "@/server/services/vendorPayouts";

describe("V2 payout execution safety", () => {
	it.each([
		[500_000, 1_000, 0],
		[500_100, 2_500, 0],
		[999_900, 2_500, 0],
		[1_000_000, 2_500, 5_000],
		[5_000_100, 5_000, 5_000],
	])("calculates the current NGN transfer bands for %i kobo", (amount, fee, duty) => {
		expect(calculatePaystackTransferCosts(amount)).toEqual({
			transferFeeKobo: fee,
			stampDutyKobo: duty,
		});
	});

	it("cannot authorize a balance or transfer call while the money interlock is closed", () => {
		expect(() => assertPayoutV2MoneyMovementEnabled()).toThrow(/locked/);
	});
});
