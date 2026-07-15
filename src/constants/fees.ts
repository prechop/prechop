export const BASIS_POINTS_DENOMINATOR = 10_000;

/** A fee percentage can never exceed 100% of the subtotal it is taken from. */
export const MAX_FEE_PERCENT = 100;
/** Sanity ceiling for the buyer service-fee cap: ₦1,000,000 in kobo. */
export const MAX_FEE_CAP_KOBO = 100_000_000;

/**
 * Coerce an untrusted value (env string, Mongo doc field, admin payload) to a
 * finite number, or `null` if it isn't one.
 *
 * This exists because the two obvious coercions are both silently wrong on a
 * money path: `Number("")` is `0` — an unset env var or a cleared admin input
 * would zero a real fee — and `Number("8%")` is `NaN`, which propagates through
 * arithmetic into an `NaN` charge. Both are rejected here so the caller can fall
 * back to a known default instead of charging nothing.
 */
function toFiniteNumber(raw: unknown): number | null {
	if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
	if (typeof raw === "string") {
		const trimmed = raw.trim();
		if (trimmed === "") return null; // Number("") === 0
		const parsed = Number(trimmed); // Number("8%") === NaN
		return Number.isFinite(parsed) ? parsed : null;
	}
	// booleans, objects, arrays, null, undefined — never a fee.
	return null;
}

/**
 * Read a fee value from an untrusted source. An absent value falls back
 * silently (it simply isn't configured); a *present but invalid* value falls
 * back loudly, because that is a misconfiguration someone needs to fix.
 * An explicit, valid `0` is honoured — that is a deliberate zero-fee policy,
 * not the accidental one this guard exists to prevent.
 */
function readFee({
	raw,
	fallback,
	max,
	label,
}: {
	raw: unknown;
	fallback: number;
	max: number;
	label: string;
}): number {
	if (raw === undefined || raw === null) return fallback;
	const parsed = toFiniteNumber(raw);
	if (parsed === null || parsed < 0 || parsed > max) {
		console.warn(
			`[fees] Ignoring invalid ${label}=${JSON.stringify(raw)} — expected a number in [0, ${max}]. Falling back to ${fallback}.`,
		);
		return fallback;
	}
	return parsed;
}

// ── Env-sourced defaults ─────────────────────────────────────────────────────
// These are the *fallback* policy. The live policy is whatever an admin has set
// in siteConfigs; these values are what a missing/invalid config resolves to, so
// a config problem can never charge 0%.

export const PRECHOP_VENDOR_COMMISSION_PERCENT = readFee({
	raw: process.env.PLATFORM_FEE_VENDOR_PERCENT,
	fallback: 8,
	max: MAX_FEE_PERCENT,
	label: "env.PLATFORM_FEE_VENDOR_PERCENT",
});
export const PRECHOP_BUYER_SERVICE_FEE_PERCENT = readFee({
	raw: process.env.PLATFORM_FEE_BUYER_PERCENT,
	fallback: 3,
	max: MAX_FEE_PERCENT,
	label: "env.PLATFORM_FEE_BUYER_PERCENT",
});
export const PRECHOP_BUYER_SERVICE_FEE_MAX_KOBO = readFee({
	raw: process.env.PLATFORM_FEE_BUYER_MAX_KOBO,
	fallback: 20_000,
	max: MAX_FEE_CAP_KOBO,
	label: "env.PLATFORM_FEE_BUYER_MAX_KOBO",
});

export const PRECHOP_VENDOR_COMMISSION_BASIS_POINTS = Math.round(
	PRECHOP_VENDOR_COMMISSION_PERCENT * 100,
);
export const PRECHOP_BUYER_SERVICE_FEE_BASIS_POINTS = Math.round(
	PRECHOP_BUYER_SERVICE_FEE_PERCENT * 100,
);

// ── Fee policy ───────────────────────────────────────────────────────────────

/** The effective, resolved fee policy applied to an order. */
export interface FeePolicy {
	/** Buyer service fee, percent of food subtotal (e.g. 3). */
	buyerPercent: number;
	/** Hard cap on the buyer service fee, in kobo (e.g. 20000 = ₦200). */
	buyerMaxKobo: number;
	/** Vendor commission, percent of food subtotal (e.g. 8). */
	vendorPercent: number;
}

/**
 * The policy applied when siteConfigs has nothing valid to say. Sourced from
 * env so ops can move it without a deploy, and never 0 by accident.
 */
export const DEFAULT_FEE_POLICY: FeePolicy = {
	buyerPercent: PRECHOP_BUYER_SERVICE_FEE_PERCENT,
	buyerMaxKobo: PRECHOP_BUYER_SERVICE_FEE_MAX_KOBO,
	vendorPercent: PRECHOP_VENDOR_COMMISSION_PERCENT,
};

/**
 * Structural shape of the siteConfigs fields that carry fee policy. Typed as
 * `unknown` on purpose: the declared Mongoose types say `number`, but a legacy
 * doc, a hand-edited record, or a partial migration can hand us `null`, `""`,
 * or a string at runtime. Trusting the declaration here is how a fee silently
 * becomes 0.
 */
export interface FeePolicySource {
	platformFeeBuyerPercent?: unknown;
	platformFeeBuyerMaxKobo?: unknown;
	platformFeeVendorPercent?: unknown;
}

/**
 * Resolve the effective fee policy from a siteConfigs document.
 *
 * This is the single place that decides what a fee is. Every value is validated
 * against {@link DEFAULT_FEE_POLICY}; an unset field falls back quietly, a
 * garbage field falls back with a warning, and an admin-set `0` is respected.
 */
export function resolveFeePolicy(source?: FeePolicySource | null): FeePolicy {
	return {
		buyerPercent: readFee({
			raw: source?.platformFeeBuyerPercent,
			fallback: DEFAULT_FEE_POLICY.buyerPercent,
			max: MAX_FEE_PERCENT,
			label: "siteConfigs.platformFeeBuyerPercent",
		}),
		buyerMaxKobo: readFee({
			raw: source?.platformFeeBuyerMaxKobo,
			fallback: DEFAULT_FEE_POLICY.buyerMaxKobo,
			max: MAX_FEE_CAP_KOBO,
			label: "siteConfigs.platformFeeBuyerMaxKobo",
		}),
		vendorPercent: readFee({
			raw: source?.platformFeeVendorPercent,
			fallback: DEFAULT_FEE_POLICY.vendorPercent,
			max: MAX_FEE_PERCENT,
			label: "siteConfigs.platformFeeVendorPercent",
		}),
	};
}

// ── Calculation ──────────────────────────────────────────────────────────────

/**
 * Percentages are applied at basis-point resolution (two decimal places of a
 * percent), then rounded to a whole kobo. Nigeria has no sub-kobo denomination,
 * so a fractional fee is not a payable amount.
 */
function percentOfKobo(amountKobo: number, percent: number): number {
	const basisPoints = Math.round(percent * 100);
	return Math.round((amountKobo * basisPoints) / BASIS_POINTS_DENOMINATOR);
}

export function calculateVendorCommissionKobo(
	foodSubtotalKobo: number,
	policy: FeePolicy = DEFAULT_FEE_POLICY,
): number {
	return percentOfKobo(Math.max(0, foodSubtotalKobo), policy.vendorPercent);
}

export function calculateBuyerServiceFeeKobo(
	foodSubtotalKobo: number,
	policy: FeePolicy = DEFAULT_FEE_POLICY,
): number {
	return Math.min(
		percentOfKobo(Math.max(0, foodSubtotalKobo), policy.buyerPercent),
		policy.buyerMaxKobo,
	);
}

export const calculatePrechopCommissionKobo = calculateVendorCommissionKobo;
export const calculateBuyerPaidProcessingFeeKobo = calculateBuyerServiceFeeKobo;
