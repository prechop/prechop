import {
	PRECHOP_BUYER_SERVICE_FEE_MAX_KOBO,
	PRECHOP_BUYER_SERVICE_FEE_PERCENT,
	PRECHOP_VENDOR_COMMISSION_PERCENT,
} from "@/constants/fees";

export interface ISiteConfigs {
	_id?: string;
	// fees — the live pricing policy read by `placeOrder` via `resolveFeePolicy`.
	// Percent of the food subtotal, not a flat amount.
	/** Buyer service fee, percent of food subtotal (e.g. 3 = 3%). */
	platformFeeBuyerPercent: number;
	/** Hard cap on the buyer service fee, in kobo (e.g. 20000 = ₦200). */
	platformFeeBuyerMaxKobo: number;
	/** Vendor commission, percent of food subtotal (e.g. 8 = 8%). */
	platformFeeVendorPercent: number;
	/**
	 * @deprecated Retired. These flat-kobo fields defaulted to 0, were editable
	 * in Admin → Settings, and were read by nothing in the pricing path — an
	 * admin "changing the fee" silently did nothing. They are gone from the
	 * schema, the defaults and the validator; the percent fields above are the
	 * real policy. Declared only so out-of-slice readers still compile until
	 * they migrate — see HANDOFF. Do not add new reads.
	 */
	platformFeeBuyerKobo?: number;
	/** @deprecated Retired — see {@link ISiteConfigs.platformFeeBuyerKobo}. */
	platformFeeVendorKobo?: number;
	// order policy
	slotHoldTtlSeconds: number;
	abandonedOrderMinutes: number;
	externalPaymentLinkTtlMinutes: number;
	reviewWindowHours: number;
	cutoffWarningMinutes: number;
	// feature flags
	whatsappTvEnabled: boolean;
	marketplaceEnabled: boolean;
	reviewsEnabled: boolean;
	// kill switches
	ordersKillSwitch: boolean;
	paymentsKillSwitch: boolean;
	// vendor visibility
	profileCompletenessRequired: number;
	updatedAt?: Date;
	updatedBy?: string;
}

export const DEFAULT_SITE_CONFIGS: ISiteConfigs = {
	// Env-sourced, never 0 by accident: an unseeded or invalid config resolves to
	// the same 3%/₦200-cap buyer and 8% vendor fees the platform charges today.
	platformFeeBuyerPercent: PRECHOP_BUYER_SERVICE_FEE_PERCENT,
	platformFeeBuyerMaxKobo: PRECHOP_BUYER_SERVICE_FEE_MAX_KOBO,
	platformFeeVendorPercent: PRECHOP_VENDOR_COMMISSION_PERCENT,
	slotHoldTtlSeconds: 600,
	abandonedOrderMinutes: 15,
	externalPaymentLinkTtlMinutes: 60 * 24,
	reviewWindowHours: 72,
	cutoffWarningMinutes: 30,
	whatsappTvEnabled: true,
	marketplaceEnabled: true,
	reviewsEnabled: true,
	ordersKillSwitch: false,
	paymentsKillSwitch: false,
	profileCompletenessRequired: 100,
};
