import mongoose, { type Model } from "mongoose";
import {
	type ISettlementMigrationConfig,
	SETTLEMENT_MIGRATION_MODES,
	type SettlementMigrationMode,
} from "./types";

const collectionName = "settlementMigrationConfigs";
type MigrationConfigModel = Model<any>;

const schema = new mongoose.Schema<any>(
	{
		key: {
			type: String,
			enum: ["primary"],
			default: "primary",
			unique: true,
		},
		mode: {
			type: String,
			enum: SETTLEMENT_MIGRATION_MODES,
			default: "V1_ONLY",
			required: true,
		},
		version: { type: Number, default: 1, min: 1, required: true },
		pilotVendorIds: {
			type: [
				{ type: mongoose.Schema.Types.ObjectId, ref: "vendorProfiles" },
			],
			default: [],
		},
		pilotCampusIds: {
			type: [{ type: mongoose.Schema.Types.ObjectId, ref: "campuses" }],
			default: [],
		},
		minimumPayoutKobo: { type: Number, default: 100_000, min: 1 },
		transferFeesPaidBy: {
			type: String,
			enum: ["PRECHOP"],
			default: "PRECHOP",
		},
		reservePolicyStatus: {
			type: String,
			enum: ["EXTERNALLY_PENDING"],
			default: "EXTERNALLY_PENDING",
		},
		legalAccountingStatus: {
			type: String,
			enum: ["EXTERNALLY_PENDING", "APPROVED"],
			default: "EXTERNALLY_PENDING",
		},
		paystackApprovalStatus: {
			type: String,
			enum: ["PENDING", "APPROVED"],
			default: "PENDING",
		},
		updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
		changeReason: { type: String },
	},
	{ timestamps: true },
);

schema.pre("aggregate", function () {
	this.pipeline().push({ $addFields: { id: { $toString: "$_id" } } });
	this.pipeline().push({ $project: { __v: 0 } });
});

export const SettlementMigrationConfig: MigrationConfigModel =
	(mongoose.models[collectionName] as MigrationConfigModel | undefined) ??
	mongoose.model<any>(collectionName, schema);

export async function getSettlementMigrationConfigDB(): Promise<ISettlementMigrationConfig> {
	const doc = await SettlementMigrationConfig.findOneAndUpdate(
		{ key: "primary" },
		{ $setOnInsert: { key: "primary" } },
		{ upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
	);
	return doc.toObject() as unknown as ISettlementMigrationConfig;
}

export async function updateSettlementMigrationConfigDB(input: {
	mode?: SettlementMigrationMode;
	pilotVendorIds?: string[];
	pilotCampusIds?: string[];
	updatedBy: string;
	changeReason: string;
}): Promise<ISettlementMigrationConfig> {
	const set: Record<string, unknown> = {
		updatedBy: new mongoose.Types.ObjectId(input.updatedBy),
		changeReason: input.changeReason,
	};
	if (input.mode) set.mode = input.mode;
	if (input.pilotVendorIds)
		set.pilotVendorIds = input.pilotVendorIds.map(
			(id) => new mongoose.Types.ObjectId(id),
		);
	if (input.pilotCampusIds)
		set.pilotCampusIds = input.pilotCampusIds.map(
			(id) => new mongoose.Types.ObjectId(id),
		);
	const doc = await SettlementMigrationConfig.findOneAndUpdate(
		{ key: "primary" },
		{ $set: set, $inc: { version: 1 }, $setOnInsert: { key: "primary" } },
		{ upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
	);
	return doc.toObject() as unknown as ISettlementMigrationConfig;
}

export * from "./types";
