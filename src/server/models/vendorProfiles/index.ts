import mongoose, { type ClientSession, type Model } from "mongoose";
import { ErrVendorNotFound, encrypt, MAX_LIMIT } from "../../constants";
import { databaseResponseTimeHistogram } from "../../metrics";
import { LocationType, MenuCategory, VendorStatus, VendorType } from "../enums";
import { IOperationType } from "../utils";
import type { IVendorProfile, IVendorProfileCreateInput } from "./types";

const collectionName = "vendorProfiles";

export type VendorProfileModel = Model<any>;

const schema = new mongoose.Schema<any>(
	{
		userId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "users",
			required: true,
			unique: true,
		},
		campusId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "campuses",
			required: true,
			index: true,
		},
		vendorType: { type: String, enum: Object.values(VendorType) },
		businessName: { type: String, trim: true },
		description: { type: String },
		email: {
			type: String,
			required: true,
			unique: true,
			lowercase: true,
			trim: true,
		},
		status: {
			type: String,
			enum: Object.values(VendorStatus),
			default: VendorStatus.INCOMPLETE,
			index: true,
		},
		locationType: { type: String, enum: Object.values(LocationType) },
		schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "schools" },
		schoolNameOther: { type: String },
		hostelOrStallName: { type: String },
		state: { type: String },
		areaOrAddress: { type: String },
		profileImageUrl: { type: String },
		categories: {
			type: [String],
			enum: Object.values(MenuCategory),
			default: [],
		},
		paystackSubaccountCode: { type: String },
		bankCode: { type: String },
		bankName: { type: String },
		accountNumber: { type: String, select: false },
		accountName: { type: String },
		rating: { type: Number, default: 0 },
		totalReviews: { type: Number, default: 0 },
		totalOrders: { type: Number, default: 0 },
		completionRate: { type: Number, default: 0 },
		profileCompleteness: { type: Number, default: 10 },
		isOpenForOrders: { type: Boolean, default: false },
		deleted: { type: Boolean, default: false, select: false },
	},
	{ timestamps: true },
);

// Marketplace listing hot path: campus + status + open + completeness.
schema.index({ campusId: 1, status: 1, isOpenForOrders: 1 });

schema.pre("aggregate", function () {
	this.pipeline().unshift({ $match: { deleted: false } });
	this.pipeline().push({ $addFields: { id: { $toString: "$_id" } } });
	this.pipeline().push({
		$project: { accountNumber: 0, deleted: 0, __v: 0 },
	});
});

export const VendorProfile: VendorProfileModel =
	(mongoose.models[collectionName] as VendorProfileModel | undefined) ??
	mongoose.model<any>(collectionName, schema);

// ── Writes ────────────────────────────────────────────────────────────────

export async function createVendorProfileDB({
	payload,
	session,
}: {
	payload: IVendorProfileCreateInput;
	session?: ClientSession;
}): Promise<IVendorProfile | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		const doc = await new VendorProfile(payload).save({ session });
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createVendorProfileDB",
			success: "true",
		});
		return doc.toObject() as unknown as IVendorProfile;
	} catch {
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createVendorProfileDB",
			success: "false",
		});
		return null;
	}
}

export async function updateVendorProfileDB({
	id,
	payload,
	session,
}: {
	id: string;
	payload: Partial<IVendorProfile>;
	session?: ClientSession;
}): Promise<IVendorProfile | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		// Encrypt account number if present in the update.
		const update: Record<string, unknown> = { ...payload };
		if (typeof update.accountNumber === "string" && update.accountNumber) {
			update.accountNumber = encrypt(update.accountNumber);
		}
		const res = await VendorProfile.findByIdAndUpdate(
			new mongoose.Types.ObjectId(id),
			{ $set: update },
			{ session, returnDocument: "after" },
		);
		if (!res) throw ErrVendorNotFound;
		timer({
			operation: IOperationType.Update,
			collection: collectionName,
			method: "updateVendorProfileDB",
			success: "true",
		});
		return res.toObject() as unknown as IVendorProfile;
	} catch {
		timer({
			operation: IOperationType.Update,
			collection: collectionName,
			method: "updateVendorProfileDB",
			success: "false",
		});
		return null;
	}
}

export async function setVendorStatusDB({
	id,
	status,
	session,
}: {
	id: string;
	status: VendorStatus;
	session?: ClientSession;
}): Promise<boolean> {
	try {
		const res = await VendorProfile.findByIdAndUpdate(
			new mongoose.Types.ObjectId(id),
			{ $set: { status } },
			{ session, returnDocument: "after" },
		);
		return !!res;
	} catch {
		return false;
	}
}

export async function setVendorOpenForOrdersDB({
	id,
	isOpenForOrders,
	session,
}: {
	id: string;
	isOpenForOrders: boolean;
	session?: ClientSession;
}): Promise<boolean> {
	try {
		const res = await VendorProfile.findByIdAndUpdate(
			new mongoose.Types.ObjectId(id),
			{ $set: { isOpenForOrders } },
			{ session, returnDocument: "after" },
		);
		return !!res;
	} catch {
		return false;
	}
}

export async function setVendorCompletenessDB({
	id,
	profileCompleteness,
	session,
}: {
	id: string;
	profileCompleteness: number;
	session?: ClientSession;
}): Promise<boolean> {
	try {
		const res = await VendorProfile.findByIdAndUpdate(
			new mongoose.Types.ObjectId(id),
			{ $set: { profileCompleteness } },
			{ session, returnDocument: "after" },
		);
		return !!res;
	} catch {
		return false;
	}
}

export async function incrementVendorOrderCountDB({
	id,
	by = 1,
	session,
}: {
	id: string;
	by?: number;
	session?: ClientSession;
}): Promise<boolean> {
	try {
		const res = await VendorProfile.findByIdAndUpdate(
			new mongoose.Types.ObjectId(id),
			{ $inc: { totalOrders: by } },
			{ session, returnDocument: "after" },
		);
		return !!res;
	} catch {
		return false;
	}
}

export async function updateVendorRatingDB({
	id,
	rating,
	totalReviews,
	session,
}: {
	id: string;
	rating: number;
	totalReviews: number;
	session?: ClientSession;
}): Promise<boolean> {
	try {
		const res = await VendorProfile.findByIdAndUpdate(
			new mongoose.Types.ObjectId(id),
			{ $set: { rating, totalReviews } },
			{ session, returnDocument: "after" },
		);
		return !!res;
	} catch {
		return false;
	}
}

// ── Reads ─────────────────────────────────────────────────────────────────

export async function getVendorProfileByIdDB({
	id,
	session,
}: {
	id: string;
	session?: ClientSession;
}): Promise<IVendorProfile | null> {
	try {
		if (!mongoose.Types.ObjectId.isValid(id)) return null;
		return (
			(
				await VendorProfile.aggregate<IVendorProfile>(
					[
						{ $match: { _id: new mongoose.Types.ObjectId(id) } },
						{ $limit: 1 },
					],
					{ session },
				)
			).at(0) ?? null
		);
	} catch {
		return null;
	}
}

export async function getVendorProfileByEmailDB({
	email,
	session,
}: {
	email: string;
	session?: ClientSession;
}): Promise<IVendorProfile | null> {
	try {
		return (
			(
				await VendorProfile.aggregate<IVendorProfile>(
					[{ $match: { email: email.toLowerCase() } }, { $limit: 1 }],
					{ session },
				)
			).at(0) ?? null
		);
	} catch {
		return null;
	}
}

export async function getVendorProfileByUserIdDB({
	userId,
	session,
}: {
	userId: string;
	session?: ClientSession;
}): Promise<IVendorProfile | null> {
	try {
		if (!mongoose.Types.ObjectId.isValid(userId)) return null;
		return (
			(
				await VendorProfile.aggregate<IVendorProfile>(
					[
						{
							$match: {
								userId: new mongoose.Types.ObjectId(userId),
							},
						},
						{ $limit: 1 },
					],
					{ session },
				)
			).at(0) ?? null
		);
	} catch {
		return null;
	}
}

/** Internal: fetch a vendor's decrypted-capable payout secrets (accountNumber). */
export async function getVendorWithSecretsDB({
	id,
	session,
}: {
	id: string;
	session?: ClientSession;
}): Promise<IVendorProfile | null> {
	try {
		const res = await VendorProfile.findById(
			new mongoose.Types.ObjectId(id),
			null,
			{ session },
		)
			.select("+accountNumber")
			.lean<IVendorProfile>();
		return res
			? ({ ...res, id: res._id.toString() } as IVendorProfile)
			: null;
	} catch {
		return null;
	}
}

export async function listVendorsDB({
	campusId,
	status,
	category,
	openOnly,
	limit = MAX_LIMIT,
	offset = 0,
	session,
}: {
	campusId?: string;
	status?: VendorStatus;
	category?: MenuCategory;
	openOnly?: boolean;
	limit?: number;
	offset?: number;
	session?: ClientSession;
}): Promise<IVendorProfile[]> {
	try {
		const match: Record<string, unknown> = {};
		if (campusId && mongoose.Types.ObjectId.isValid(campusId)) {
			match.campusId = new mongoose.Types.ObjectId(campusId);
		}
		if (status) match.status = status;
		if (category) match.categories = category;
		if (openOnly) match.isOpenForOrders = true;
		return await VendorProfile.aggregate<IVendorProfile>(
			[
				{ $match: match },
				{ $sort: { rating: -1, totalOrders: -1 } },
				{ $skip: offset },
				{ $limit: Math.min(limit, MAX_LIMIT) },
			],
			{ session },
		);
	} catch {
		return [];
	}
}

export async function countVendorsDB({
	filter,
}: {
	filter?: Record<string, unknown>;
} = {}): Promise<number> {
	try {
		return await VendorProfile.countDocuments({
			deleted: false,
			...(filter ?? {}),
		});
	} catch {
		return 0;
	}
}

export * from "./types";
