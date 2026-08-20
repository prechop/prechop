import mongoose, { type ClientSession, type Model } from "mongoose";
import type { IVendorFollowerDocument } from "./types";

const collectionName = "vendorFollowers";

export type VendorFollowerModel = Model<any>;

const schema = new mongoose.Schema<IVendorFollowerDocument>(
	{
		buyerId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "users",
			required: true,
			index: true,
		},
		vendorId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "vendorProfiles",
			required: true,
			index: true,
		},
	},
	{
		timestamps: { createdAt: "createdAt", updatedAt: false },
	},
);

schema.index({ buyerId: 1, vendorId: 1 }, { unique: true });
schema.index({ vendorId: 1, createdAt: -1 });

export const VendorFollower: VendorFollowerModel =
	(mongoose.models[collectionName] as VendorFollowerModel | undefined) ??
	mongoose.model<any>(collectionName, schema);

// ── Writes ────────────────────────────────────────────────────────────────

export async function createVendorFollowerDB({
	buyerId,
	vendorId,
	session,
}: {
	buyerId: string;
	vendorId: string;
	session?: ClientSession;
}): Promise<IVendorFollowerDocument | null> {
	try {
		const doc = await new VendorFollower({
			buyerId: new mongoose.Types.ObjectId(buyerId),
			vendorId: new mongoose.Types.ObjectId(vendorId),
		}).save({ session });
		return doc.toObject() as unknown as IVendorFollowerDocument;
	} catch {
		return null;
	}
}

export async function deleteVendorFollowerDB({
	buyerId,
	vendorId,
	session,
}: {
	buyerId: string;
	vendorId: string;
	session?: ClientSession;
}): Promise<boolean> {
	try {
		const res = await VendorFollower.deleteOne({
			buyerId: new mongoose.Types.ObjectId(buyerId),
			vendorId: new mongoose.Types.ObjectId(vendorId),
		});
		return res.deletedCount > 0;
	} catch {
		return false;
	}
}

// ── Reads ─────────────────────────────────────────────────────────────────

export async function getVendorFollowerDB({
	buyerId,
	vendorId,
	session,
}: {
	buyerId: string;
	vendorId: string;
	session?: ClientSession;
}): Promise<IVendorFollowerDocument | null> {
	try {
		const doc = await VendorFollower.findOne({
			buyerId: new mongoose.Types.ObjectId(buyerId),
			vendorId: new mongoose.Types.ObjectId(vendorId),
		});
		return doc ? (doc.toObject() as unknown as IVendorFollowerDocument) : null;
	} catch {
		return null;
	}
}

export async function countVendorFollowersDB({
	vendorId,
	session,
}: {
	vendorId: string;
	session?: ClientSession;
}): Promise<number> {
	try {
		return await VendorFollower.countDocuments({
			vendorId: new mongoose.Types.ObjectId(vendorId),
		});
	} catch {
		return 0;
	}
}

export async function countNewVendorFollowersDB({
	vendorId,
	since,
	session,
}: {
	vendorId: string;
	since: Date;
	session?: ClientSession;
}): Promise<number> {
	try {
		return await VendorFollower.countDocuments({
			vendorId: new mongoose.Types.ObjectId(vendorId),
			createdAt: { $gte: since },
		});
	} catch {
		return 0;
	}
}

export async function listFollowedVendorIdsDB({
	buyerId,
	session,
}: {
	buyerId: string;
	session?: ClientSession;
}): Promise<string[]> {
	try {
		const docs = await VendorFollower.find({
			buyerId: new mongoose.Types.ObjectId(buyerId),
		});
		return docs.map((doc) => doc.vendorId.toString());
	} catch {
		return [];
	}
}

export async function listVendorFollowersDB({
	vendorId,
	limit = 50,
	session,
}: {
	vendorId: string;
	limit?: number;
	session?: ClientSession;
}): Promise<IVendorFollowerDocument[]> {
	try {
		const docs = await VendorFollower.find({
			vendorId: new mongoose.Types.ObjectId(vendorId),
		})
			.sort({ createdAt: -1 })
			.limit(limit);
		return docs.map((doc) => doc.toObject() as unknown as IVendorFollowerDocument);
	} catch {
		return [];
	}
}
