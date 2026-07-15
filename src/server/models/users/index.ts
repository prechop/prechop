import mongoose, { type ClientSession, type Model } from "mongoose";
import {
	phoneHash as computePhoneHash,
	ErrInvalidAction,
	ErrUserNotFound,
	encrypt,
	MAX_LIMIT,
	normalizeNigerianMobilePhone,
} from "../../constants";
import { databaseResponseTimeHistogram } from "../../metrics";
import type { IJwtPayload } from "../../types";
import { IOperationType } from "../utils";
import type { IUser, IUserCreateInput } from "./types";
import { generateAuthToken } from "./utils";

const collectionName = "users";

export type UserModel = Model<any>;

const schema = new mongoose.Schema<any>(
	{
		campusId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "campuses",
			required: true,
			index: true,
		},
		// Authorization is driven entirely by IAM: the union of policies from a
		// user's groups plus any directly-attached managed policies. There is no
		// role enum — "is a vendor" derives from Vendors-group membership.
		groupIds: {
			type: [{ type: mongoose.Schema.Types.ObjectId, ref: "groups" }],
			default: [],
			index: true,
		},
		directPolicyIds: {
			type: [{ type: mongoose.Schema.Types.ObjectId, ref: "policies" }],
			default: [],
		},
		firstName: { type: String, required: true, trim: true },
		lastName: { type: String, required: true, trim: true },
		// Encrypted at rest. `phoneHash` carries the unique constraint since the
		// ciphertext is non-deterministic.
		phone: { type: String, required: true, select: false },
		phoneHash: { type: String, required: true, unique: true, index: true },
		isPhoneVerified: { type: Boolean, default: false },
		isActive: { type: Boolean, default: true },
		lastLoginAt: { type: Date, required: false },
		refreshTokens: {
			type: [
				{
					_id: false,
					refreshToken: { type: String, required: true },
					deadline: { type: Date, required: true },
				},
			],
			select: false,
			default: [],
		},
		deleted: { type: Boolean, default: false, select: false },
	},
	{ timestamps: true },
);

schema.index({ "refreshTokens.deadline": 1 });

schema.pre("aggregate", function () {
	this.pipeline().unshift({ $match: { deleted: false } });
	this.pipeline().push({ $addFields: { id: { $toString: "$_id" } } });
	this.pipeline().push({
		$project: {
			phone: 0,
			phoneHash: 0,
			refreshTokens: 0,
			deleted: 0,
			__v: 0,
		},
	});
});

schema.methods.generateAuthToken = async function (
	ip?: string,
): Promise<IJwtPayload> {
	const result = await generateAuthToken({
		userId: this._id.toString(),
		ip: ip || "",
		shouldRegenerateRefreshToken: true,
	});
	if (!result) throw ErrInvalidAction;

	// SECURITY: cap concurrent sessions at 3 so a stolen refresh token can't
	// coexist with the victim's legitimate sessions undetected.
	const MAX_REFRESH_TOKENS = 3;
	const existing = this?.refreshTokens ?? [];
	const trimmed =
		existing.length >= MAX_REFRESH_TOKENS
			? existing.slice(existing.length - MAX_REFRESH_TOKENS + 1)
			: existing;
	this.refreshTokens = [
		...trimmed,
		{
			refreshToken: result.refreshToken,
			deadline: result.refreshTokenExpiresIn,
		},
	];
	await this.save();
	return result;
};

export const User: UserModel =
	(mongoose.models[collectionName] as UserModel | undefined) ??
	mongoose.model<any>(collectionName, schema);

// ── Writes ────────────────────────────────────────────────────────────────

export async function createUserDB({
	payload,
	session,
}: {
	payload: IUserCreateInput;
	session?: ClientSession;
}): Promise<IUser | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		const normalizedPhone =
			normalizeNigerianMobilePhone(payload.phone) ?? payload.phone;
		const doc = await new User({
			campusId: payload.campusId,
			groupIds: (payload.groupIds ?? []).map(
				(g) => new mongoose.Types.ObjectId(g),
			),
			directPolicyIds: (payload.directPolicyIds ?? []).map(
				(p) => new mongoose.Types.ObjectId(p),
			),
			firstName: payload.firstName,
			lastName: payload.lastName,
			phone: encrypt(normalizedPhone),
			phoneHash: computePhoneHash(normalizedPhone),
			isPhoneVerified: payload.isPhoneVerified ?? false,
			isActive: payload.isActive ?? true,
		}).save({ session });
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createUserDB",
			success: "true",
		});
		return doc.toObject() as unknown as IUser;
	} catch {
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createUserDB",
			success: "false",
		});
		return null;
	}
}

export async function markPhoneVerifiedDB({
	id,
	session,
}: {
	id: string;
	session?: ClientSession;
}): Promise<boolean> {
	try {
		const res = await User.findByIdAndUpdate(
			new mongoose.Types.ObjectId(id),
			{ $set: { isPhoneVerified: true, lastLoginAt: new Date() } },
			{ session, returnDocument: "after" },
		);
		return !!res;
	} catch {
		return false;
	}
}

export async function updateLastLoginDB({
	id,
	session,
}: {
	id: string;
	session?: ClientSession;
}): Promise<boolean> {
	try {
		const res = await User.findByIdAndUpdate(
			new mongoose.Types.ObjectId(id),
			{ $set: { lastLoginAt: new Date() } },
			{ session, returnDocument: "after" },
		);
		return !!res;
	} catch {
		return false;
	}
}

export async function setUserActiveDB({
	id,
	isActive,
	session,
}: {
	id: string;
	isActive: boolean;
	session?: ClientSession;
}): Promise<boolean> {
	try {
		const res = await User.findByIdAndUpdate(
			new mongoose.Types.ObjectId(id),
			{ $set: { isActive } },
			{ session, returnDocument: "after" },
		);
		return !!res;
	} catch {
		return false;
	}
}

export async function updateUserProfileDB({
	id,
	firstName,
	lastName,
	campusId,
	session,
}: {
	id: string;
	firstName?: string;
	lastName?: string;
	campusId?: string;
	session?: ClientSession;
}): Promise<IUser | null> {
	try {
		const set: Record<string, unknown> = {};
		if (firstName !== undefined) set.firstName = firstName;
		if (lastName !== undefined) set.lastName = lastName;
		if (campusId !== undefined) {
			set.campusId = new mongoose.Types.ObjectId(campusId);
		}
		const res = await User.findByIdAndUpdate(
			new mongoose.Types.ObjectId(id),
			{ $set: set },
			{ session, returnDocument: "after" },
		);
		return res ? (res.toObject() as unknown as IUser) : null;
	} catch {
		return null;
	}
}

// ── Reads ─────────────────────────────────────────────────────────────────

export async function updateUserPhoneDB({
	id,
	phone,
	session,
}: {
	id: string;
	phone: string;
	session?: ClientSession;
}): Promise<IUser | null> {
	try {
		const normalizedPhone = normalizeNigerianMobilePhone(phone) ?? phone;
		const res = await User.findByIdAndUpdate(
			new mongoose.Types.ObjectId(id),
			{
				$set: {
					phone: encrypt(normalizedPhone),
					phoneHash: computePhoneHash(normalizedPhone),
					isPhoneVerified: true,
				},
			},
			{ session, returnDocument: "after" },
		);
		return res ? (res.toObject() as unknown as IUser) : null;
	} catch {
		return null;
	}
}

export async function getUserByIdDB({
	id,
	session,
}: {
	id: string;
	session?: ClientSession;
}): Promise<IUser | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		if (!mongoose.Types.ObjectId.isValid(id)) return null;
		const result =
			(
				await User.aggregate<IUser>(
					[
						{ $match: { _id: new mongoose.Types.ObjectId(id) } },
						{ $limit: 1 },
					],
					{ session },
				)
			).at(0) ?? null;
		if (!result) throw ErrUserNotFound;
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "getUserByIdDB",
			success: "true",
		});
		return result;
	} catch {
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "getUserByIdDB",
			success: "false",
		});
		return null;
	}
}

export async function getUsersByIdsDB({
	ids,
	session,
}: {
	ids: string[];
	session?: ClientSession;
}): Promise<IUser[]> {
	try {
		return await User.aggregate<IUser>(
			[
				{
					$match: {
						_id: {
							$in: ids
								.filter((id) =>
									mongoose.Types.ObjectId.isValid(id),
								)
								.map((id) => new mongoose.Types.ObjectId(id)),
						},
					},
				},
			],
			{ session },
		);
	} catch {
		return [];
	}
}

/**
 * Look up a user by phone (plaintext). Returns the FULL doc including the
 * encrypted `phone`, `phoneHash`, and `refreshTokens` — for internal auth use
 * only; never return this shape to a client.
 */
export async function getUserByPhoneDB({
	phone,
	session,
}: {
	phone: string;
	session?: ClientSession;
}): Promise<IUser | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		const normalizedPhone = normalizeNigerianMobilePhone(phone) ?? phone;
		const result = await User.findOne(
			{ phoneHash: computePhoneHash(normalizedPhone), deleted: false },
			null,
			{ session },
		)
			.select("+phone +phoneHash +refreshTokens")
			.lean<IUser>();
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "getUserByPhoneDB",
			success: "true",
		});
		return result
			? ({ ...result, id: result._id.toString() } as IUser)
			: null;
	} catch {
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "getUserByPhoneDB",
			success: "false",
		});
		return null;
	}
}

// ── IAM attachments (groups & direct policies) ─────────────────────────────

export async function setUserGroupsDB({
	id,
	groupIds,
	session,
}: {
	id: string;
	groupIds: string[];
	session?: ClientSession;
}): Promise<boolean> {
	try {
		if (!mongoose.Types.ObjectId.isValid(id)) return false;
		const res = await User.findByIdAndUpdate(
			new mongoose.Types.ObjectId(id),
			{
				$set: {
					groupIds: groupIds
						.filter((g) => mongoose.Types.ObjectId.isValid(g))
						.map((g) => new mongoose.Types.ObjectId(g)),
				},
			},
			{ session, returnDocument: "after" },
		);
		return !!res;
	} catch {
		return false;
	}
}

export async function setUserDirectPoliciesDB({
	id,
	policyIds,
	session,
}: {
	id: string;
	policyIds: string[];
	session?: ClientSession;
}): Promise<boolean> {
	try {
		if (!mongoose.Types.ObjectId.isValid(id)) return false;
		const res = await User.findByIdAndUpdate(
			new mongoose.Types.ObjectId(id),
			{
				$set: {
					directPolicyIds: policyIds
						.filter((p) => mongoose.Types.ObjectId.isValid(p))
						.map((p) => new mongoose.Types.ObjectId(p)),
				},
			},
			{ session, returnDocument: "after" },
		);
		return !!res;
	} catch {
		return false;
	}
}

/** Add a group to a user if not already present (used by registration/seed). */
export async function addUserToGroupDB({
	id,
	groupId,
	session,
}: {
	id: string;
	groupId: string;
	session?: ClientSession;
}): Promise<boolean> {
	try {
		if (
			!mongoose.Types.ObjectId.isValid(id) ||
			!mongoose.Types.ObjectId.isValid(groupId)
		)
			return false;
		const res = await User.findByIdAndUpdate(
			new mongoose.Types.ObjectId(id),
			{ $addToSet: { groupIds: new mongoose.Types.ObjectId(groupId) } },
			{ session, returnDocument: "after" },
		);
		return !!res;
	} catch {
		return false;
	}
}

/** Pull a group from every user that has it (used when deleting a group). */
export async function removeGroupFromAllUsersDB({
	groupId,
	session,
}: {
	groupId: string;
	session?: ClientSession;
}): Promise<number> {
	if (!mongoose.Types.ObjectId.isValid(groupId)) return 0;
	const res = await User.updateMany(
		{ groupIds: new mongoose.Types.ObjectId(groupId) },
		{ $pull: { groupIds: new mongoose.Types.ObjectId(groupId) } },
		{ session },
	);
	return res.modifiedCount ?? 0;
}

/** Pull a policy from every user's direct attachments (used when deleting one). */
export async function removePolicyFromAllUsersDB({
	policyId,
	session,
}: {
	policyId: string;
	session?: ClientSession;
}): Promise<number> {
	if (!mongoose.Types.ObjectId.isValid(policyId)) return 0;
	const res = await User.updateMany(
		{ directPolicyIds: new mongoose.Types.ObjectId(policyId) },
		{ $pull: { directPolicyIds: new mongoose.Types.ObjectId(policyId) } },
		{ session },
	);
	return res.modifiedCount ?? 0;
}

export async function countUsersInGroupDB({
	groupId,
	session,
}: {
	groupId: string;
	session?: ClientSession;
}): Promise<number> {
	if (!mongoose.Types.ObjectId.isValid(groupId)) return 0;
	return User.countDocuments(
		{ groupIds: new mongoose.Types.ObjectId(groupId), deleted: false },
		{ session },
	);
}

/** Paginated user listing for the admin IAM screen. */
export async function listUsersDB({
	search,
	groupId,
	campusId,
	skip = 0,
	limit = 25,
	session,
}: {
	search?: string;
	groupId?: string;
	campusId?: string;
	skip?: number;
	limit?: number;
	session?: ClientSession;
} = {}): Promise<{ users: IUser[]; total: number }> {
	const match: Record<string, unknown> = { deleted: false };
	if (groupId && mongoose.Types.ObjectId.isValid(groupId))
		match.groupIds = new mongoose.Types.ObjectId(groupId);
	if (campusId && mongoose.Types.ObjectId.isValid(campusId))
		match.campusId = new mongoose.Types.ObjectId(campusId);
	if (search) {
		const safe = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		match.$or = [
			{ firstName: { $regex: safe, $options: "i" } },
			{ lastName: { $regex: safe, $options: "i" } },
		];
	}

	const [users, total] = await Promise.all([
		User.aggregate<IUser>(
			[
				{ $match: match },
				{ $sort: { createdAt: -1 } },
				{ $skip: skip },
				{ $limit: Math.min(limit, 100) },
			],
			{ session },
		),
		User.countDocuments(match, { session }),
	]);
	return { users, total };
}

// ── Auth token lifecycle (embedded refresh tokens) ─────────────────────────

export async function loginUserDB({
	id,
	ip,
	session,
}: {
	id: string;
	ip?: string;
	session?: ClientSession;
}): Promise<IJwtPayload | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		const doc = await User.findById(new mongoose.Types.ObjectId(id), null, {
			session,
		}).select("+refreshTokens");
		const result = await doc?.generateAuthToken(ip);
		if (!result) throw ErrInvalidAction;
		timer({
			operation: IOperationType.Update,
			collection: collectionName,
			method: "loginUserDB",
			success: "true",
		});
		return result;
	} catch {
		timer({
			operation: IOperationType.Update,
			collection: collectionName,
			method: "loginUserDB",
			success: "false",
		});
		return null;
	}
}

export async function reLoginUserWithRefreshTokenDB({
	id,
	refreshToken,
	ip,
	session,
}: {
	id: string;
	refreshToken: string;
	ip: string;
	session?: ClientSession;
}): Promise<IJwtPayload | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		// Atomic claim-and-pull: concurrent requests with the same refresh
		// token — only one succeeds; the other gets null and is rejected.
		const now = new Date();
		const filter = {
			_id: new mongoose.Types.ObjectId(id),
			deleted: false,
			refreshTokens: {
				$elemMatch: { refreshToken, deadline: { $gt: now } },
			},
		} as unknown as Parameters<typeof User.findOneAndUpdate>[0];
		const claimed = await User.findOneAndUpdate(
			filter,
			{ $pull: { refreshTokens: { refreshToken } } },
			{ session, returnDocument: "after" },
		).select("+refreshTokens");

		if (!claimed) throw ErrUserNotFound;

		const result = await claimed.generateAuthToken(ip);
		timer({
			operation: IOperationType.Update,
			collection: collectionName,
			method: "reLoginUserWithRefreshTokenDB",
			success: "true",
		});
		return result;
	} catch {
		timer({
			operation: IOperationType.Update,
			collection: collectionName,
			method: "reLoginUserWithRefreshTokenDB",
			success: "false",
		});
		return null;
	}
}

export async function logoutUserDB({
	id,
	refreshToken,
	session,
}: {
	id: string;
	refreshToken: string;
	session?: ClientSession;
}): Promise<boolean> {
	try {
		const res = await User.findByIdAndUpdate(
			new mongoose.Types.ObjectId(id),
			{ $pull: { refreshTokens: { refreshToken } } },
			{
				returnDocument: "after",
				projection: { refreshTokens: 0 },
				session,
			},
		);
		return !!res;
	} catch {
		return false;
	}
}

export async function removeExpiredUsersTokensDB(): Promise<boolean> {
	try {
		const now = new Date();
		const res = await User.updateMany(
			{ "refreshTokens.deadline": { $lt: now } },
			{ $pull: { refreshTokens: { deadline: { $lt: now } } } },
		);
		return res.acknowledged;
	} catch {
		return false;
	}
}

/** By-id lookup that includes the encrypted `phone` (for SMS/receipt paths). */
export async function getUserByIdWithPhoneDB({
	id,
	session,
}: {
	id: string;
	session?: ClientSession;
}): Promise<IUser | null> {
	try {
		if (!mongoose.Types.ObjectId.isValid(id)) return null;
		const res = await User.findOne(
			{ _id: new mongoose.Types.ObjectId(id), deleted: false },
			null,
			{
				session,
			},
		)
			.select("+phone +phoneHash")
			.lean<IUser>();
		return res ? ({ ...res, id: res._id.toString() } as IUser) : null;
	} catch {
		return null;
	}
}

export async function countUsersDB({
	filter,
}: {
	filter?: Record<string, unknown>;
} = {}): Promise<number> {
	try {
		return await User.countDocuments({ deleted: false, ...(filter ?? {}) });
	} catch {
		return 0;
	}
}

export * from "./types";
export { MAX_LIMIT };
