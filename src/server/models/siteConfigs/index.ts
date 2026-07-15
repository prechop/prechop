import mongoose, { type Model } from "mongoose";
import { databaseResponseTimeHistogram } from "../../metrics";
import { IOperationType } from "../utils";
import { DEFAULT_SITE_CONFIGS, type ISiteConfigs } from "./types";

const collectionName = "siteConfigs";

export type SiteConfigsModel = Model<any>;

const schema = new mongoose.Schema<any>(
	{
		// Fee policy. `min`/`max` are defence in depth behind the zod validator at
		// the trust boundary; `runValidators` on the upsert below enforces them.
		platformFeeBuyerPercent: {
			type: Number,
			default: DEFAULT_SITE_CONFIGS.platformFeeBuyerPercent,
			min: 0,
			max: 100,
		},
		platformFeeBuyerMaxKobo: {
			type: Number,
			default: DEFAULT_SITE_CONFIGS.platformFeeBuyerMaxKobo,
			min: 0,
		},
		platformFeeVendorPercent: {
			type: Number,
			default: DEFAULT_SITE_CONFIGS.platformFeeVendorPercent,
			min: 0,
			max: 100,
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
				// Schema-level bounds (fee percents 0–100) are enforced on the
				// write, not just on read. Without this, `findOneAndUpdate`
				// skips validators entirely.
				runValidators: true,
			},
		)
			.lean<ISiteConfigs>()
			.exec();
		return res ?? null;
	} catch (error) {
		// A rejected policy write must not look like a no-op to the caller —
		// `updateSiteConfigs` surfaces the null, and this is the only record of
		// why it was rejected.
		console.error("upsertSiteConfigsDB failed:", error);
		return null;
	}
}

export * from "./types";
