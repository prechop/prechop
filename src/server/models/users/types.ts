import type { IJwtPayload } from "../../types";

export interface IRefreshTokenEntry {
	refreshToken: string;
	deadline: Date;
}

export interface IUserCreateInput {
	campusId: string;
	/** IAM group ids assigned at creation (e.g. the Buyers or Vendors group). */
	groupIds?: string[];
	/** Managed policy ids attached directly to the user (rarely set at signup). */
	directPolicyIds?: string[];
	firstName: string;
	lastName: string;
	// `phone` is provided in plaintext to the create fn, which encrypts it and
	// derives `phoneHash` before persisting. Never store plaintext.
	phone: string;
	isPhoneVerified?: boolean;
	isActive?: boolean;
	// NOTE: no `email` here on purpose. No signup path has a user email to give:
	// buyers are never asked for one, and the address `registerVendor` collects is
	// the *business* contact that belongs to `vendorProfiles.email` — copying it
	// here would duplicate a separately-editable field and let the two drift.
	// Email is captured post-signup via `updateUserProfileDB`.
}

export interface IUser {
	_id: string;
	id?: string;
	campusId: string;
	/**
	 * Optional notification address — NOT a credential and NOT an identity.
	 * Authentication is phone + OTP; buyers are never asked for an email, so most
	 * users legitimately have none and this is `undefined`. Set only by the owning
	 * user from /account, and used on a best-effort basis (e.g. emailing a receipt
	 * PDF that is stored regardless). Absent rather than `""` when unset.
	 *
	 * Do not make this required, and do not treat it as unique: see the schema
	 * path in `./index.ts` for why there is deliberately no unique index.
	 */
	email?: string;
	/** IAM group ids the user belongs to. */
	groupIds: string[];
	/** Managed policy ids attached directly to the user. */
	directPolicyIds: string[];
	firstName: string;
	lastName: string;
	// AES-256-GCM ciphertext. Decrypt with `constants/crypto.decrypt` only when
	// returning to the owning user.
	phone: string;
	phoneHash: string;
	isPhoneVerified: boolean;
	isActive: boolean;
	lastLoginAt?: Date;
	refreshTokens?: IRefreshTokenEntry[];
	deleted: boolean;
	createdAt: Date;
	updatedAt: Date;
}

export interface IUserMethods extends IUser {
	generateAuthToken(ip?: string): Promise<IJwtPayload>;
}

/** Shape safe to return to clients (phone decrypted, secrets stripped). */
export interface IUserPublic {
	id: string;
	campusId: string;
	/** Resolved group names, for UI labelling. */
	groups: string[];
	/** Resolved effective permission action strings, for UI gating. */
	permissions: string[];
	firstName: string;
	lastName: string;
	phone: string;
	/** Absent when the user has not supplied one — see {@link IUser.email}. */
	email?: string;
	isPhoneVerified: boolean;
	isActive: boolean;
	createdAt: Date;
}
