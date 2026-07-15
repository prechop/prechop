export interface ISiteConfigs {
	_id?: string;
	// fees (kobo)
	platformFeeBuyerKobo: number;
	platformFeeVendorKobo: number;
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
	platformFeeBuyerKobo: 0,
	platformFeeVendorKobo: 0,
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
