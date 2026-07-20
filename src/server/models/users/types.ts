import type { IJwtPayload } from "../../types";

export interface IRefreshTokenEntry {
	refreshToken: string;
	deadline: Date;
}

export interface IUserCreateInput {
	campusId?: string;
	/** IAM group ids assigned at creation (e.g. the Buyers or Vendors group). */
	groupIds?: string[];
	/** Managed policy ids attached directly to the user (rarely set at signup). */
	directPolicyIds?: string[];
	firstName: string;
	lastName: string;
	email: string;
	profileImageUrl?: string;
	googleSubject?: string;
	googleEmailVerified?: boolean;
	phone?: string;
	isActive?: boolean;
}

export interface IUser {
	_id: string;
	id?: string;
	campusId?: string;
	email: string;
	/** IAM group ids the user belongs to. */
	groupIds: string[];
	/** Managed policy ids attached directly to the user. */
	directPolicyIds: string[];
	firstName: string;
	lastName: string;
	profileImageUrl?: string;
	googleSubject?: string;
	googleEmailVerified?: boolean;
	// AES-256-GCM ciphertext. Decrypt with `constants/crypto.decrypt` only when
	// returning to the owning user.
	phone?: string;
	phoneHash?: string;
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
	campusId?: string;
	/** Resolved group names, for UI labelling. */
	groups: string[];
	/** Resolved effective permission action strings, for UI gating. */
	permissions: string[];
	firstName: string;
	lastName: string;
	profileImageUrl?: string;
	phone?: string;
	email: string;
	isActive: boolean;
	createdAt: Date;
}
