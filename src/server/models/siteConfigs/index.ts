import mongoose, { type Model } from "mongoose";
import { databaseResponseTimeHistogram } from "../../metrics";
import { IOperationType } from "../utils";
import { DEFAULT_SITE_CONFIGS, type ISiteConfigs } from "./types";

const collectionName = "siteConfigs";

export type SiteConfigsModel = Model<any>;

const schema = new mongoose.Schema<any>(
	{
		platformFeeBuyerKobo: {
			type: Number,
			default: DEFAULT_SITE_CONFIGS.platformFeeBuyerKobo,
		},
		platformFeeVendorKobo: {
			type: Number,
			default: DEFAULT_SITE_CONFIGS.platformFeeVendorKobo,
		},
		slotHoldTtlSeconds: {
			type: Number,
			default: DEFAULT_SITE_CONFIGS.slotHoldTtlSeconds,
		},
		abandonedOrderMinutes: {
			type: Number,
			default: DEFAULT_SITE_CONFIGS.abandonedOrderMinutes,
		},
		externalPaymentLinkTtlMinutes: {
			type: Number,
			default: DEFAULT_SITE_CONFIGS.externalPaymentLinkTtlMinutes,
		},
		reviewWindowHours: {
			type: Number,
			default: DEFAULT_SITE_CONFIGS.reviewWindowHours,
		},
		cutoffWarningMinutes: {
			type: Number,
			default: DEFAULT_SITE_CONFIGS.cutoffWarningMinutes,
		},
		whatsappTvEnabled: {
			type: Boolean,
			default: DEFAULT_SITE_CONFIGS.whatsappTvEnabled,
		},
		marketplaceEnabled: {
			type: Boolean,
			default: DEFAULT_SITE_CONFIGS.marketplaceEnabled,
		},
		reviewsEnabled: {
			type: Boolean,
			default: DEFAULT_SITE_CONFIGS.reviewsEnabled,
		},
		ordersKillSwitch: {
			type: Boolean,
			default: DEFAULT_SITE_CONFIGS.ordersKillSwitch,
		},
		paymentsKillSwitch: {
			type: Boolean,
			default: DEFAULT_SITE_CONFIGS.paymentsKillSwitch,
		},
		profileCompletenessRequired: {
			type: Number,
			default: DEFAULT_SITE_CONFIGS.profileCompletenessRequired,
		},
		updatedBy: { type: String },
	},
	{ timestamps: true },
);

export const SiteConfigs: SiteConfigsModel =
	(mongoose.models[collectionName] as SiteConfigsModel | undefined) ??
	mongoose.model<any>(collectionName, schema);

/** Fetch the single site-config doc (lean). Returns null if none seeded. */
export async function getSiteConfigsDocDB(): Promise<ISiteConfigs | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		const res = await SiteConfigs.findOne({}, null, {})
			.lean<ISiteConfigs>()
			.exec();
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "getSiteConfigsDocDB",
			success: "true",
		});
		return res ?? null;
	} catch {
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "getSiteConfigsDocDB",
			success: "false",
		});
		return null;
	}
}

export async function upsertSiteConfigsDB({
	payload,
	updatedBy,
}: {
	payload: Partial<ISiteConfigs>;
	updatedBy: string;
}): Promise<ISiteConfigs | null> {
	try {
		const res = await SiteConfigs.findOneAndUpdate(
			{},
			{ $set: { ...payload, updatedBy } },
			{
				upsert: true,
				returnDocument: "after",
				setDefaultsOnInsert: true,
			},
		)
			.lean<ISiteConfigs>()
			.exec();
		return res ?? null;
	} catch {
		return null;
	}
}

export * from "./types";
