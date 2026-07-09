import mongoose, { type Model } from "mongoose";

/**
 * Singleton document holding a global `permVersion` counter. Any change to a
 * group, policy, or a user's attachments bumps it; resolved-permission caches
 * are keyed by the current value, so a single bump invalidates every cache.
 */

const collectionName = "iamMeta";

export type IamMetaModel = Model<any>;

const schema = new mongoose.Schema<any>(
	{
		key: {
			type: String,
			required: true,
			unique: true,
			default: "singleton",
		},
		permVersion: { type: Number, default: 1 },
	},
	{ timestamps: true },
);

export const IamMeta: IamMetaModel =
	(mongoose.models[collectionName] as IamMetaModel | undefined) ??
	mongoose.model<any>(collectionName, schema);

export async function getPermVersionDB(): Promise<number> {
	const doc = await IamMeta.findOneAndUpdate(
		{ key: "singleton" },
		{ $setOnInsert: { permVersion: 1 } },
		{ upsert: true, returnDocument: "after" },
	).lean<{ permVersion: number }>();
	return doc?.permVersion ?? 1;
}

export async function bumpPermVersionDB(): Promise<number> {
	const doc = await IamMeta.findOneAndUpdate(
		{ key: "singleton" },
		{ $inc: { permVersion: 1 } },
		{ upsert: true, returnDocument: "after" },
	).lean<{ permVersion: number }>();
	return doc?.permVersion ?? 1;
}
