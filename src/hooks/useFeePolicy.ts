"use client";

import useSWR from "swr";
import type { FeePolicy } from "@/constants/fees";
import { formatKobo } from "@/constants/formatters";

/**
 * The client's only honest source for "what fee will be applied".
 *
 * ## Why this hook exists
 *
 * Every fee number shown to a user used to be hardcoded ("3% capped at ₦200",
 * "8% commission") or derived from `DEFAULT_FEE_POLICY`. Both are wrong for the
 * same underlying reason: the live policy is admin-governed in `siteConfigs`,
 * and neither a string literal nor an env constant can see an admin's edit.
 *
 * The env route is not merely unused — it *cannot* work. `PLATFORM_FEE_*` has no
 * `NEXT_PUBLIC_` prefix, so in the client bundle `process.env.PLATFORM_FEE_*` is
 * a stub that is always `undefined` and `readFee` returns its hardcoded
 * fallback. Adding the prefix would not fix it either: that bakes the value in
 * at build time and still ignores siteConfigs. The value has to cross the wire,
 * per request. That is what `GET /api/site-configs/marketplace` now does.
 *
 * ## Why this route
 *
 * Checkout is pre-auth — a buyer sees the service-fee line before they have an
 * account — so the quote has to come from an unauthenticated endpoint. This one
 * is already polled by the marketplace, storefront and order pages for
 * `marketplaceEnabled`, so SWR dedupes the policy onto a request that was being
 * made anyway.
 */

/** Wire shape of `GET /api/site-configs/marketplace`. */
interface MarketplacePolicyResponse {
  marketplaceEnabled: boolean;
  platformFeeBuyerPercent: number;
  platformFeeBuyerMaxKobo: number;
  platformFeeVendorPercent: number;
}

const POLICY_KEY = "/site-configs/marketplace";

/**
 * Accept a wire value only if it is genuinely a finite number.
 *
 * Deliberately narrower than `resolveFeePolicy` from `@/constants/fees`, which
 * must NOT be used here. Its fallback is `DEFAULT_FEE_POLICY`, which on the
 * client resolves to the hardcoded 3%/₦200/8% — so an older server that omits
 * these fields would silently produce a confident, wrong quote. That is the
 * exact bug this hook exists to kill. A missing field must degrade to "we don't
 * know", never to a plausible-looking guess.
 */
function finite(raw: unknown): number | null {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

/**
 * Map the wire response to a {@link FeePolicy}, or `undefined` if the server
 * did not supply a complete policy. All three fields are required together: a
 * partial policy would quote a percent with no cap (or vice versa) and overstate
 * or understate the fee. The server has already validated these through the same
 * `resolveFeePolicy` guard `placeOrder` charges with, so a complete response is
 * authoritative — this only guards the shape.
 */
function toPolicy(data?: MarketplacePolicyResponse): FeePolicy | undefined {
  if (!data) return undefined;
  const buyerPercent = finite(data.platformFeeBuyerPercent);
  const buyerMaxKobo = finite(data.platformFeeBuyerMaxKobo);
  const vendorPercent = finite(data.platformFeeVendorPercent);
  if (buyerPercent === null || buyerMaxKobo === null || vendorPercent === null)
    return undefined;
  return { buyerPercent, buyerMaxKobo, vendorPercent };
}

export interface UseFeePolicyResult {
  /** The effective policy, or `undefined` while loading / on failure. */
  policy: FeePolicy | undefined;
  isLoading: boolean;
  /** True when the policy could not be read. Callers must not quote a number. */
  isUnavailable: boolean;
}

/**
 * Fetch the effective, admin-governed fee policy.
 *
 * Pass `policy` straight into `calculateBuyerServiceFeeKobo(subtotal, policy)`
 * — the shape matches on purpose — and derive any user-facing prose from the
 * `describe*` helpers below rather than writing a number into a string.
 */
export function useFeePolicy(): UseFeePolicyResult {
  const { data, error, isLoading } = useSWR<MarketplacePolicyResponse>(
    POLICY_KEY,
    { revalidateOnFocus: false },
  );
  const policy = toPolicy(data);
  return {
    policy,
    isLoading,
    isUnavailable: !isLoading && (!!error || !policy),
  };
}

/* ------------------------------------------------------- prose derivations */
//
// These exist so no surface has to interpolate a rate into a sentence by hand —
// that is how "8% commission" ends up hardcoded in five files and wrong in all
// of them the moment an admin edits the rate. Each returns a truthful,
// number-free sentence when the policy is unknown: vague is recoverable, a
// confidently wrong number on a consent checkbox is not.

/** e.g. "3% of the food subtotal, capped at ₦200". */
export function describeBuyerFee(policy?: FeePolicy): string {
  if (!policy) return "a service fee on the food subtotal";
  return `${policy.buyerPercent}% of the food subtotal, capped at ${formatKobo(
    policy.buyerMaxKobo,
  )}`;
}

/** e.g. "8% of the food subtotal". */
export function describeVendorCommission(policy?: FeePolicy): string {
  if (!policy) return "a commission on the food subtotal";
  return `${policy.vendorPercent}% of the food subtotal`;
}

/**
 * The buyer's pre-payment explainer. PRD §8.7 requires the buyer to see the
 * service fee before paying, never for the first time on the Paystack page.
 */
export function describeBuyerFeeExplainer(policy?: FeePolicy): string {
  if (!policy)
    return "Service fee: a percentage of your food subtotal, applied at checkout. It covers secure payment processing and running the platform.";
  return `Service fee: ${describeBuyerFee(
    policy,
  )}. It covers secure payment processing and running the platform.`;
}

/** The full vendor-facing fee summary shown on onboarding and settings. */
export function describeFeePolicy(policy?: FeePolicy): string {
  if (!policy) {
    return "Prechop deducts a commission from the food subtotal of every successful order. Paystack transaction charges are borne by Prechop and do not reduce the vendor’s agreed settlement.";
  }

  return `Prechop deducts ${describeVendorCommission(
    policy,
  )} from the food subtotal of every successful order. The vendor receives the remaining balance in accordance with the applicable settlement terms. Paystack transaction charges are borne by Prechop and do not reduce the vendor’s agreed settlement.`;
}
// export function describeFeePolicy(policy?: FeePolicy): string {
//   if (!policy)
//     return "Prechop charges a commission on the food subtotal of every successful order, and buyers pay a service fee. Paystack processing fees are absorbed by Prechop.";
//   return `Prechop charges a ${describeVendorCommission(
//     policy,
//   )} on every successful order. Buyers pay a service fee of ${describeBuyerFee(
//     policy,
//   )}. Paystack processing fees are absorbed by Prechop.`;
// }

/**
 * The label on the vendor's consent checkbox.
 *
 * This one matters most: a vendor ticking a box against a hardcoded "8%" is
 * consenting to a number that may no longer be the rate they will be charged.
 * When the policy is unknown the label stays deliberately number-free rather
 * than naming a rate we cannot stand behind.
 */
export function describeVendorConsent(policy?: FeePolicy): string {
  if (!policy) return "I accept Prechop's commission policy.";
  return `I accept Prechop's ${policy.vendorPercent}% commission policy.`;
}
