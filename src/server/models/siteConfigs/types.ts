export interface ISiteConfigs {
	_id?: string;
	// fees (kobo)
	platformFeeBuyerKobo: number;
	platformFeeVendorKobo: number;
	// order policy
	slotHoldTtlSeconds: number;
	abandonedOrderMinutes: number;
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
	platformFeeBuyerKobo: 5000,
	platformFeeVendorKobo: 10000,
	slotHoldTtlSeconds: 600,
	abandonedOrderMinutes: 15,
	reviewWindowHours: 72,
	cutoffWarningMinutes: 30,
	whatsappTvEnabled: true,
	marketplaceEnabled: true,
	reviewsEnabled: true,
	ordersKillSwitch: false,
	paymentsKillSwitch: false,
	profileCompletenessRequired: 100,
};
