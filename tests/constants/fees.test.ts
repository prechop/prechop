// The fee model is the money path: every naira the platform takes from a buyer
// or a vendor is decided here. The failure this suite exists to prevent is not a
// crash — it is a SILENT wrong charge. A config that resolves to 0% does not
// error; it just quietly stops earning, or quietly overcharges, and nobody finds
// out until the ledger is reconciled.
//
// Three questions, per the brief:
//   1. does the default config still charge exactly what it charges today?
//   2. does an admin change actually move the charged amount?
//   3. can an empty/garbage config ever silently charge 0?

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	calculateBuyerServiceFeeKobo,
	calculateVendorCommissionKobo,
	DEFAULT_FEE_POLICY,
	type FeePolicy,
	MAX_FEE_CAP_KOBO,
	MAX_FEE_PERCENT,
	resolveFeePolicy,
} from "@/constants/fees";

const NAIRA = 100; // kobo

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
	vi.restoreAllMocks();
});

describe("fee policy — the documented default is what actually gets charged", () => {
	// These are the numbers the business agreed to: 3% buyer capped at ₦200,
	// 8% vendor. They are asserted as literals ON PURPOSE. If a refactor changes
	// what a default order costs, this test must fail — that is the whole point.
	it("defaults to 3% buyer / ₦200 cap / 8% vendor", () => {
		expect(DEFAULT_FEE_POLICY).toEqual({
			buyerPercent: 3,
			buyerMaxKobo: 20_000,
			vendorPercent: 8,
		});
	});

	it.each([
		// [food subtotal ₦, expected buyer fee kobo, expected vendor commission kobo]
		[1_000, 3_000, 8_000],
		[2_500, 7_500, 20_000],
		[5_000, 15_000, 40_000],
	])("charges a ₦%i order exactly %i kobo buyer / %i kobo vendor", (naira, buyerKobo, vendorKobo) => {
		const subtotal = naira * NAIRA;
		expect(calculateBuyerServiceFeeKobo(subtotal)).toBe(buyerKobo);
		expect(calculateVendorCommissionKobo(subtotal)).toBe(vendorKobo);
	});

	it("caps the buyer fee at ₦200 — the cap binds above ₦6,666.67", () => {
		// 3% of ₦6,666.67 is ₦200.00 — the exact knee of the cap.
		expect(calculateBuyerServiceFeeKobo(666_667)).toBe(20_000);
		// Ten times bigger, same fee. The cap is absolute, not a soft taper.
		expect(calculateBuyerServiceFeeKobo(6_666_670)).toBe(20_000);
	});

	it("does not cap the vendor commission — 8% is uncapped by design", () => {
		// Vendor commission has no `vendorMaxKobo`. If a cap is ever added,
		// this test should fail and force a deliberate decision.
		expect(calculateVendorCommissionKobo(100_000_000)).toBe(8_000_000);
	});

	it("resolves to the default when siteConfigs says nothing", () => {
		expect(resolveFeePolicy(undefined)).toEqual(DEFAULT_FEE_POLICY);
		expect(resolveFeePolicy(null)).toEqual(DEFAULT_FEE_POLICY);
		expect(resolveFeePolicy({})).toEqual(DEFAULT_FEE_POLICY);
	});
});

describe("fee policy — an admin change actually moves the charged amount", () => {
	// A config that parses but never reaches the arithmetic is the subtlest
	// version of this bug: admin sees 5%, buyer is charged 3%, nothing errors.
	it("applies an admin-set buyer percent to the charge", () => {
		const policy = resolveFeePolicy({ platformFeeBuyerPercent: 5 });
		expect(policy.buyerPercent).toBe(5);
		// ₦1,000 at 5% = ₦50 = 5000 kobo, vs 3000 at the default.
		expect(calculateBuyerServiceFeeKobo(100_000, policy)).toBe(5_000);
		expect(calculateBuyerServiceFeeKobo(100_000)).toBe(3_000);
	});

	it("applies an admin-set vendor percent to the charge", () => {
		const policy = resolveFeePolicy({ platformFeeVendorPercent: 12 });
		expect(calculateVendorCommissionKobo(100_000, policy)).toBe(12_000);
		expect(calculateVendorCommissionKobo(100_000)).toBe(8_000);
	});

	it("applies an admin-set buyer cap to the charge", () => {
		const policy = resolveFeePolicy({ platformFeeBuyerMaxKobo: 5_000 });
		// 3% of ₦10,000 would be ₦300, but the admin capped it at ₦50.
		expect(calculateBuyerServiceFeeKobo(1_000_000, policy)).toBe(5_000);
	});

	it("moves all three levers at once", () => {
		const policy = resolveFeePolicy({
			platformFeeBuyerPercent: 1.5,
			platformFeeBuyerMaxKobo: 100_000,
			platformFeeVendorPercent: 10,
		});
		expect(policy).toEqual({
			buyerPercent: 1.5,
			buyerMaxKobo: 100_000,
			vendorPercent: 10,
		});
		expect(calculateBuyerServiceFeeKobo(100_000, policy)).toBe(1_500);
		expect(calculateVendorCommissionKobo(100_000, policy)).toBe(10_000);
	});

	it("honours an explicit, deliberate 0% — a promo is not a typo", () => {
		const policy = resolveFeePolicy({
			platformFeeBuyerPercent: 0,
			platformFeeVendorPercent: 0,
		});
		expect(policy.buyerPercent).toBe(0);
		expect(policy.vendorPercent).toBe(0);
		expect(calculateBuyerServiceFeeKobo(100_000, policy)).toBe(0);
		expect(calculateVendorCommissionKobo(100_000, policy)).toBe(0);
		// A real 0 is not a misconfiguration — it must not warn.
		expect(warnSpy).not.toHaveBeenCalled();
	});

	it("honours a 0 cap — 'no buyer fee' expressed via the cap", () => {
		const policy = resolveFeePolicy({ platformFeeBuyerMaxKobo: 0 });
		expect(calculateBuyerServiceFeeKobo(1_000_000, policy)).toBe(0);
	});
});

describe("fee policy — garbage config must NEVER silently charge 0", () => {
	// This is the adversarial core. Each value below is one a real system hands
	// you: a cleared admin input (""), a legacy null, a partial migration, a
	// hand-edited Mongo doc, a string where the schema promised a number.
	// Garbage for ANY numeric fee field, whatever its range.
	const GARBAGE: Array<[string, unknown]> = [
		["empty string (Number('') === 0)", ""],
		["whitespace", "   "],
		["a percent sign (Number('8%') === NaN)", "8%"],
		["free text", "three percent"],
		["NaN", Number.NaN],
		["Infinity", Number.POSITIVE_INFINITY],
		["-Infinity", Number.NEGATIVE_INFINITY],
		["negative", -5],
		["boolean true", true],
		["boolean false", false],
		["an object", { percent: 3 }],
		["an array", [3]],
	];

	// Out-of-range is field-specific: 101 is a nonsense PERCENT but a perfectly
	// ordinary CAP (₦1.01). Sharing one list across both fields would assert
	// that a valid cap is garbage — which is how a test starts lying.
	const PERCENT_GARBAGE: Array<[string, unknown]> = [
		...GARBAGE,
		["over 100%", MAX_FEE_PERCENT + 1],
	];
	const CAP_GARBAGE: Array<[string, unknown]> = [
		...GARBAGE,
		["above the ₦1,000,000 ceiling", MAX_FEE_CAP_KOBO + 1],
	];

	it.each(
		PERCENT_GARBAGE,
	)("falls back to the default buyer percent on %s — never 0", (_label, raw) => {
		const policy = resolveFeePolicy({ platformFeeBuyerPercent: raw });
		expect(policy.buyerPercent).toBe(DEFAULT_FEE_POLICY.buyerPercent);
		// The charge itself, not just the parsed policy — this is what a
		// buyer is actually billed.
		expect(calculateBuyerServiceFeeKobo(100_000, policy)).toBe(3_000);
		// Loud: a present-but-invalid value is someone's mistake to fix.
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining("siteConfigs.platformFeeBuyerPercent"),
		);
	});

	it.each(
		PERCENT_GARBAGE,
	)("falls back to the default vendor percent on %s — never 0", (_label, raw) => {
		const policy = resolveFeePolicy({ platformFeeVendorPercent: raw });
		expect(policy.vendorPercent).toBe(DEFAULT_FEE_POLICY.vendorPercent);
		expect(calculateVendorCommissionKobo(100_000, policy)).toBe(8_000);
	});

	it.each(
		CAP_GARBAGE,
	)("falls back to the default buyer cap on %s — never a 0 cap", (_label, raw) => {
		const policy = resolveFeePolicy({ platformFeeBuyerMaxKobo: raw });
		expect(policy.buyerMaxKobo).toBe(DEFAULT_FEE_POLICY.buyerMaxKobo);
		// A 0 cap would zero EVERY buyer fee — the highest-blast-radius
		// version of this bug.
		expect(calculateBuyerServiceFeeKobo(100_000, policy)).toBe(3_000);
	});

	it("a wholly garbage config charges exactly the default, not 0", () => {
		const policy = resolveFeePolicy({
			platformFeeBuyerPercent: "",
			platformFeeBuyerMaxKobo: null,
			platformFeeVendorPercent: "eight",
		} as never);
		expect(policy).toEqual(DEFAULT_FEE_POLICY);
		expect(calculateBuyerServiceFeeKobo(100_000, policy)).toBe(3_000);
		expect(calculateVendorCommissionKobo(100_000, policy)).toBe(8_000);
	});

	it("a legacy doc carrying only the retired kobo fields charges the default", () => {
		// The pre-rewire shape. A migration that misses a doc must not zero it.
		const policy = resolveFeePolicy({
			platformFeeBuyerKobo: 0,
			platformFeeVendorKobo: 0,
		} as never);
		expect(policy).toEqual(DEFAULT_FEE_POLICY);
		expect(calculateBuyerServiceFeeKobo(100_000, policy)).toBe(3_000);
	});

	it("accepts the boundary values rather than falling back", () => {
		// 0 and the max are valid, not garbage — an off-by-one in the guard
		// would reject them and silently substitute the default.
		expect(
			resolveFeePolicy({ platformFeeBuyerPercent: MAX_FEE_PERCENT })
				.buyerPercent,
		).toBe(MAX_FEE_PERCENT);
		expect(
			resolveFeePolicy({ platformFeeBuyerMaxKobo: MAX_FEE_CAP_KOBO })
				.buyerMaxKobo,
		).toBe(MAX_FEE_CAP_KOBO);
		expect(warnSpy).not.toHaveBeenCalled();
	});

	it("accepts a numeric string — Mongo and form posts both produce them", () => {
		expect(
			resolveFeePolicy({ platformFeeBuyerPercent: "4.5" }).buyerPercent,
		).toBe(4.5);
	});
});

describe("fee arithmetic — edges", () => {
	it("never charges a fee on a negative subtotal", () => {
		expect(calculateBuyerServiceFeeKobo(-100_000)).toBe(0);
		expect(calculateVendorCommissionKobo(-100_000)).toBe(0);
	});

	it("charges nothing on a zero subtotal", () => {
		expect(calculateBuyerServiceFeeKobo(0)).toBe(0);
		expect(calculateVendorCommissionKobo(0)).toBe(0);
	});

	it("rounds to whole kobo — there is no sub-kobo denomination", () => {
		// 3% of 1 kobo = 0.03 kobo → 0.
		expect(calculateBuyerServiceFeeKobo(1)).toBe(0);
		// 3% of 17 kobo = 0.51 → 1 (round-half-up).
		expect(calculateBuyerServiceFeeKobo(17)).toBe(1);
		expect(Number.isInteger(calculateBuyerServiceFeeKobo(12_345))).toBe(
			true,
		);
		expect(Number.isInteger(calculateVendorCommissionKobo(12_345))).toBe(
			true,
		);
	});

	it("handles a fractional percent at basis-point resolution", () => {
		const policy: FeePolicy = {
			buyerPercent: 2.5,
			buyerMaxKobo: 1_000_000,
			vendorPercent: 2.5,
		};
		// 2.5% of ₦1,000 = ₦25 = 2500 kobo. A naive `percent * 100` truncation
		// would give 2% here.
		expect(calculateBuyerServiceFeeKobo(100_000, policy)).toBe(2_500);
	});

	it("never returns NaN for any plausible subtotal", () => {
		for (const subtotal of [0, 1, 99, 100_000, 999_999_999]) {
			expect(
				Number.isFinite(calculateBuyerServiceFeeKobo(subtotal)),
			).toBe(true);
			expect(
				Number.isFinite(calculateVendorCommissionKobo(subtotal)),
			).toBe(true);
		}
	});

	it("keeps the buyer fee below the cap and the vendor take sane", () => {
		// Property-ish sweep: across a wide range, invariants must hold.
		for (let naira = 0; naira <= 50_000; naira += 617) {
			const subtotal = naira * NAIRA;
			const buyer = calculateBuyerServiceFeeKobo(subtotal);
			const vendor = calculateVendorCommissionKobo(subtotal);
			expect(buyer).toBeLessThanOrEqual(DEFAULT_FEE_POLICY.buyerMaxKobo);
			expect(buyer).toBeGreaterThanOrEqual(0);
			// The platform can never take more than the order is worth.
			expect(vendor).toBeLessThanOrEqual(subtotal);
		}
	});
});
