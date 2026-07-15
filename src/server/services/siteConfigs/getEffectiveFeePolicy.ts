import { type FeePolicySource, resolveFeePolicy } from "@/constants/fees";
import { getSiteConfigs } from "./getSiteConfigs";

/**
 * The fee policy as it will actually be applied, in wire shape.
 *
 * Field names deliberately mirror `siteConfigs` so the admin form, the buyer's
 * pre-payment fee line, and the vendor's deduction notice all quote the same
 * numbers `placeOrder` charges. This is the only honest source for "what will I
 * be charged" — env constants alone would ignore an admin override, and the
 * siteConfigs doc alone can be unset or invalid.
 */
export interface EffectiveFeePolicy {
	/** Buyer service fee, percent of food subtotal (e.g. 3 = 3%). */
	platformFeeBuyerPercent: number;
	/** Hard cap on the buyer service fee, in kobo (e.g. 20000 = ₦200). */
	platformFeeBuyerMaxKobo: number;
	/** Vendor commission deducted from the food subtotal, percent (e.g. 8 = 8%). */
	platformFeeVendorPercent: number;
}

/**
 * Map an already-loaded siteConfigs doc to the wire shape, through the same
 * `resolveFeePolicy` guard `placeOrder` charges with.
 *
 * Exists so a caller that has already read siteConfigs for another reason (the
 * public marketplace endpoint reads `marketplaceEnabled` from the same doc) can
 * derive the policy from *that* doc rather than issuing a second read. Two reads
 * straddling an admin update — or a cache invalidation — could return a
 * kill-switch state and a fee policy from different versions of the config.
 */
export function toEffectiveFeePolicy(
	source?: FeePolicySource | null,
): EffectiveFeePolicy {
	const policy = resolveFeePolicy(source);
	return {
		platformFeeBuyerPercent: policy.buyerPercent,
		platformFeeBuyerMaxKobo: policy.buyerMaxKobo,
		platformFeeVendorPercent: policy.vendorPercent,
	};
}

/**
 * Resolve the effective fee policy for display.
 *
 * Reads the same config and passes it through the same `resolveFeePolicy` guard
 * that `placeOrder` uses, so what a buyer is quoted before paying cannot drift
 * from what they are charged. Any surface that *displays* a fee must resolve it
 * here — never from the `PLATFORM_FEE_*` env constants directly, which are only
 * the fallback and ignore an admin override.
 */
export async function getEffectiveFeePolicy(): Promise<EffectiveFeePolicy> {
	return toEffectiveFeePolicy(await getSiteConfigs());
}
