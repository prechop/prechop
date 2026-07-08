import type { IJwtPayload } from "../../types";
import type { UserRole } from "../enums";

export interface IRefreshTokenEntry {
	refreshToken: string;
	deadline: Date;
}

export interface IUserCreateInput {
	campusId: string;
	role?: UserRole;
	firstName: string;
	lastName: string;
	// `phone` is provided in plaintext to the create fn, which encrypts it and
	// derives `phoneHash` before persisting. Never store plaintext.
	phone: string;
	isPhoneVerified?: boolean;
	isActive?: boolean;
}

export interface IUser {
	_id: string;
	id?: string;
	campusId: string;
	role: UserRole;
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
	role: UserRole;
	firstName: string;
	lastName: string;
	phone: string;
	isPhoneVerified: boolean;
	isActive: boolean;
	createdAt: Date;
}
