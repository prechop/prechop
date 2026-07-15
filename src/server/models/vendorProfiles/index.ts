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
		campusIds: {
			type: [{ type: mongoose.Schema.Types.ObjectId, ref: "campuses" }],
			default: [],
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
		// Notification preferences (default opted-in).
		notifyNewOrders: { type: Boolean, default: true },
		notifyPayouts: { type: Boolean, default: true },
		notifyReviews: { type: Boolean, default: true },
		// Daily-order composer defaults.
		defaultPickupAvailable: { type: Boolean, default: true },
		defaultDeliveryAvailable: { type: Boolean, default: false },
		defaultDeliveryFeeKobo: { type: Number, default: 0 },
		// ── Onboarding review trail ──────────────────────────────────────
		submittedAt: { type: Date },
		reviewedAt: { type: Date },
		reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
		rejectionReason: { type: String },
		reviewNotes: { type: String },
		deleted: { type: Boolean, default: false, select: false },
	},
	{ timestamps: true },
);

// Marketplace listing hot path: campus + status + open + completeness.
schema.index({ campusId: 1, status: 1, isOpenForOrders: 1 });
schema.index({ campusIds: 1, status: 1, isOpenForOrders: 1 });

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
		// Encrypt account number at rest, mirroring updateVendorProfileDB so the
		// two writers agree and a create-with-bank-details never stores plaintext.
		const toSave: Record<string, unknown> = { ...payload };
		if (typeof toSave.accountNumber === "string" && toSave.accountNumber) {
			toSave.accountNumber = encrypt(toSave.accountNumber);
		}
		const doc = await new VendorProfile(toSave).save({ session });
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
		if (Array.isArray(update.campusIds)) {
			update.campusIds = update.campusIds
				.filter((campusId) =>
					mongoose.Types.ObjectId.isValid(String(campusId)),
				)
				.map(
					(campusId) => new mongoose.Types.ObjectId(String(campusId)),
				);
		}
		const res = await VendorProfile.findByIdAndUpdate(
			new mongoose.Types.ObjectId(id),
			{ $set: update },
			{ session, returnDocument: "after", strict: false },
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

/** Move a vendor into PENDING_REVIEW and stamp the submission time. */
export async function submitVendorForReviewDB({
	id,
	session,
}: {
	id: string;
	session?: ClientSession;
}): Promise<boolean> {
	try {
		const res = await VendorProfile.findByIdAndUpdate(
			new mongoose.Types.ObjectId(id),
			{
				$set: {
					status: VendorStatus.PENDING_REVIEW,
					submittedAt: new Date(),
					rejectionReason: null,
				},
			},
			{ session, returnDocument: "after" },
		);
		return !!res;
	} catch {
		return false;
	}
}

/** Record an admin review decision (approve → ACTIVE, reject → CHANGES_REQUESTED). */
export async function reviewVendorDB({
	id,
	status,
	reviewedBy,
	rejectionReason,
	reviewNotes,
	session,
}: {
	id: string;
	status: VendorStatus;
	reviewedBy: string;
	rejectionReason?: string;
	reviewNotes?: string;
	session?: ClientSession;
}): Promise<boolean> {
	try {
		const res = await VendorProfile.findByIdAndUpdate(
			new mongoose.Types.ObjectId(id),
			{
				$set: {
					status,
					reviewedAt: new Date(),
					reviewedBy: new mongoose.Types.ObjectId(reviewedBy),
					rejectionReason: rejectionReason ?? null,
					reviewNotes: reviewNotes ?? null,
				},
			},
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

/**
 * Persist recomputed lifetime completion rates from the nightly analytics job.
 * `completionRate` is a **percentage, 0–100** (both dashboards render it with a
 * literal `%` suffix and no conversion), rounded to 2dp by the caller.
 *
 * Bulk-writes in one round trip: the job recomputes every vendor each night, so
 * one findByIdAndUpdate per vendor would be N round trips for no reason.
 * Returns the number of profiles actually modified — vendors whose rate did not
 * change are not counted, and unknown/stale vendorIds are simply no-ops.
 */
export async function bulkUpdateVendorCompletionRatesDB({
	rates,
	session,
}: {
	rates: { vendorId: string; completionRate: number }[];
	session?: ClientSession;
}): Promise<number> {
	try {
		const ops = rates
			.filter((r) => mongoose.Types.ObjectId.isValid(r.vendorId))
			.map((r) => ({
				updateOne: {
					filter: { _id: new mongoose.Types.ObjectId(r.vendorId) },
					update: { $set: { completionRate: r.completionRate } },
				},
			}));
		if (ops.length === 0) return 0;
		const res = await VendorProfile.bulkWrite(ops, {
			session,
			ordered: false,
		});
		return res.modifiedCount ?? 0;
	} catch {
		return 0;
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

/**
 * Batch variant of `getVendorProfileByIdDB`: fetch many vendor profiles in one
 * `$in` query instead of N round trips. Ordering is not guaranteed — callers
 * that need a specific order should index the result by id. Goes through
 * `aggregate` so the shared `pre("aggregate")` projection hygiene applies
 * (drops `accountNumber`, `deleted`, `__v`; stamps `id`). Invalid ids are
 * dropped rather than throwing.
 */
export async function listVendorsByIdsDB(
	ids: string[],
	session?: ClientSession,
): Promise<IVendorProfile[]> {
	try {
		const objectIds = ids
			.filter((id) => mongoose.Types.ObjectId.isValid(id))
			.map((id) => new mongoose.Types.ObjectId(id));
		if (objectIds.length === 0) return [];
		return await VendorProfile.aggregate<IVendorProfile>(
			[{ $match: { _id: { $in: objectIds } } }],
			{ session },
		);
	} catch {
		return [];
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

export async function listMarketplaceVendorsDB({
	campusIds,
	excludeVendorId,
	limit = MAX_LIMIT,
	offset = 0,
	session,
}: {
	campusIds: string[];
	excludeVendorId?: string;
	limit?: number;
	offset?: number;
	session?: ClientSession;
}): Promise<IVendorProfile[]> {
	try {
		const ids = campusIds
			.filter((c) => mongoose.Types.ObjectId.isValid(c))
			.map((c) => new mongoose.Types.ObjectId(c));
		if (ids.length === 0) return [];
		const match: Record<string, unknown> = {
			status: VendorStatus.ACTIVE,
			deleted: false,
			$or: [{ campusId: { $in: ids } }, { campusIds: { $in: ids } }],
		};
		if (
			excludeVendorId &&
			mongoose.Types.ObjectId.isValid(excludeVendorId)
		) {
			match._id = { $ne: new mongoose.Types.ObjectId(excludeVendorId) };
		}
		return await VendorProfile.aggregate<IVendorProfile>(
			[
				{ $match: match },
				{
					$sort: {
						isOpenForOrders: -1,
						rating: -1,
						totalOrders: -1,
					},
				},
				{ $skip: offset },
				{ $limit: Math.min(limit, MAX_LIMIT) },
			],
			{ session },
		);
	} catch {
		return [];
	}
}

/**
 * Distinct ACTIVE vendorIds within `campusIds` whose business name matches `q`
 * (case-insensitive, literal). Powers the marketplace search's "by shop" dimension.
 */
export async function findVendorIdsByNameDB({
	campusIds,
	q,
}: {
	campusIds: string[];
	q: string;
}): Promise<string[]> {
	try {
		const ids = campusIds
			.filter((c) => mongoose.Types.ObjectId.isValid(c))
			.map((c) => new mongoose.Types.ObjectId(c));
		const term = q.trim();
		if (ids.length === 0 || !term) return [];
		const rows = await VendorProfile.aggregate<{
			_id: mongoose.Types.ObjectId;
		}>([
			{
				$match: {
					$or: [
						{ campusId: { $in: ids } },
						{ campusIds: { $in: ids } },
					],
					status: VendorStatus.ACTIVE,
					businessName: {
						$regex: term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
						$options: "i",
					},
				},
			},
			{ $project: { _id: 1 } },
		]);
		return rows.map((r) => r._id.toString());
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
