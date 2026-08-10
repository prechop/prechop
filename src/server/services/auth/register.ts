import { randomBytes } from "node:crypto";
import {
	ADMINISTRATORS_GROUP,
	BUYERS_GROUP,
	ErrInvalidCredentials,
	ErrUnauthorized,
	hash,
	validationError,
} from "../../constants";
import { APP_URL } from "../../constants/environments";
import { Redis } from "../../databases";
import {
	createUserDB,
	getUserByEmailDB,
	getUserByIdDB,
	getUserByVerifiedPhoneDB,
	getUsersByPhoneDB,
	getVendorProfileByUserIdDB,
	linkGoogleUserDB,
	loginUserDB,
	markUserPhoneVerifiedDB,
} from "../../models";
import { normalizeEmail } from "../../models/users";
import type { IUser, IUserPublic } from "../../models/users/types";
import { resendProvider } from "../../providers";
import type { IJwtPayload } from "../../types";
import { recordAudit } from "../audit";
import { getBuiltInGroupId, resolvePermissions } from "../iam";
import { toPublicUser } from "../users/toPublicUser";

const EMAIL_SIGN_IN_TTL_SECONDS = 60 * 60;
const GOOGLE_STATE_TTL_SECONDS = 10 * 60;

export interface AuthResult {
	token: IJwtPayload;
	user: IUserPublic;
}

function tokenKey(token: string): string {
	return `auth:email-signin:${hash(token)}`;
}

function googleStateKey(state: string): string {
	return `auth:google-state:${hash(state)}`;
}

function makeToken(): string {
	return randomBytes(32).toString("base64url");
}

export function cleanAuthNext(next?: string | null): string {
	if (!next?.startsWith("/") || next.startsWith("//")) return "/marketplace";
	return next;
}

export async function resolvePostAuthRedirect(
	user: IUserPublic,
	next?: string,
): Promise<string> {
	const cleaned = cleanAuthNext(next);
	if (cleaned === "/vendor/onboarding") {
		const vendor = await getVendorProfileByUserIdDB({ userId: user.id });
		if (!vendor || vendor.status === "INCOMPLETE") {
			return "/vendor/onboarding";
		}
		// Pending, changes-requested, and suspended vendors use the dashboard's
		// existing status gate; active vendors use the dashboard normally.
		return "/dashboard";
	}
	if (
		user.groups.includes(ADMINISTRATORS_GROUP) &&
		(cleaned === "/" || cleaned === "/marketplace")
	) {
		return "/admin";
	}
	return cleaned;
}

function nameFromEmail(email: string): { firstName: string; lastName: string } {
	const local = email
		.split("@")[0]
		?.replace(/[._-]+/g, " ")
		.trim();
	const words = (local || "Prechop Customer")
		.split(/\s+/)
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1));
	return {
		firstName: words[0] ?? "Prechop",
		lastName: words.slice(1).join(" ") || "Customer",
	};
}

async function publicAuthResult(
	userId: string,
	ip: string,
): Promise<AuthResult> {
	const token = await loginUserDB({ id: userId, ip });
	if (!token) throw ErrUnauthorized;
	const fresh = await getUserByIdForAuth(userId);
	const resolved = await resolvePermissions(userId);
	return {
		token,
		user: toPublicUser(fresh, {
			groups: resolved.groups,
			permissions: resolved.actions,
		}),
	};
}

async function getUserByIdForAuth(userId: string) {
	const user = await getUserByIdDB({ id: userId });
	if (!user?.isActive) throw ErrUnauthorized;
	return user;
}

async function findOrCreateBuyer({
	email,
	firstName,
	lastName,
	profileImageUrl,
	googleSubject,
	googleEmailVerified,
}: {
	email: string;
	firstName?: string;
	lastName?: string;
	profileImageUrl?: string;
	googleSubject?: string;
	googleEmailVerified?: boolean;
}): Promise<IUser> {
	const normalizedEmail = normalizeEmail(email);
	if (!normalizedEmail) throw validationError("Enter a valid email address.");
	const existing = await getUserByEmailDB({ email: normalizedEmail });
	if (existing) {
		if (!existing.isActive) throw ErrUnauthorized;
		const linked = await linkGoogleUserDB({
			id: existing._id.toString(),
			googleSubject,
			googleEmailVerified,
			profileImageUrl,
			firstName: firstName?.trim() || undefined,
			lastName: lastName?.trim() || undefined,
		});
		return linked ?? existing;
	}
	const fallback = nameFromEmail(normalizedEmail);
	const buyersGroupId = await getBuiltInGroupId(BUYERS_GROUP);
	const user = await createUserDB({
		payload: {
			firstName: firstName?.trim() || fallback.firstName,
			lastName: lastName?.trim() || fallback.lastName,
			email: normalizedEmail,
			profileImageUrl,
			googleSubject,
			googleEmailVerified,
			groupIds: buyersGroupId ? [buyersGroupId] : [],
			isActive: true,
		},
	});
	if (!user) throw validationError("Could not create account.");
	recordAudit({
		userId: user._id.toString(),
		role: BUYERS_GROUP,
		action: "BUYER_REGISTER_PASSWORDLESS",
		resourceType: "users",
		resourceId: user._id.toString(),
	});
	return user;
}

export async function requestEmailSignIn({
	email,
	next,
}: {
	email: string;
	next?: string;
}): Promise<{ message: string; devLink?: string }> {
	const normalizedEmail = normalizeEmail(email);
	if (!normalizedEmail) throw validationError("Enter a valid email address.");
	const token = makeToken();
	const returnTo = cleanAuthNext(next);
	await Redis.setex(
		tokenKey(token),
		EMAIL_SIGN_IN_TTL_SECONDS,
		JSON.stringify({ email: normalizedEmail, next: returnTo }),
	);
	const url = `${APP_URL.replace(/\/$/, "")}/api/auth/email/verify?token=${encodeURIComponent(token)}&next=${encodeURIComponent(returnTo)}`;
	await resendProvider.sendSignInLink(normalizedEmail, url);
	return {
		message: "Check your email for a secure Prechop sign-in link.",
		...(process.env.NODE_ENV === "production" ? {} : { devLink: url }),
	};
}

export async function verifyEmailSignIn({
	token,
	next,
	ip,
}: {
	token: string;
	next?: string;
	ip: string;
}): Promise<AuthResult & { next: string }> {
	const key = tokenKey(token);
	const raw = await Redis.get(key);
	if (!raw) throw validationError("Invalid or expired sign-in link.");
	await Redis.del(key);
	const data = JSON.parse(raw) as { email: string; next?: string };
	const user = await findOrCreateBuyer({ email: data.email });
	return {
		...(await publicAuthResult(user._id.toString(), ip)),
		next: cleanAuthNext(next ?? data.next),
	};
}

export async function createGoogleAuthState(next?: string): Promise<string> {
	const state = makeToken();
	await Redis.setex(
		googleStateKey(state),
		GOOGLE_STATE_TTL_SECONDS,
		JSON.stringify({ next: cleanAuthNext(next) }),
	);
	return state;
}

export async function consumeGoogleAuthState(
	state: string,
): Promise<{ next: string }> {
	const key = googleStateKey(state);
	const raw = await Redis.get(key);
	if (!raw) throw ErrInvalidCredentials;
	await Redis.del(key);
	const data = JSON.parse(raw) as { next?: string };
	return { next: cleanAuthNext(data.next) };
}

export async function signInWithGoogleProfile({
	email,
	firstName,
	lastName,
	profileImageUrl,
	googleSubject,
	emailVerified,
	ip,
}: {
	email: string;
	firstName?: string;
	lastName?: string;
	profileImageUrl?: string;
	googleSubject?: string;
	emailVerified: boolean;
	ip: string;
}): Promise<AuthResult> {
	if (!emailVerified) {
		throw validationError("Google email must be verified.");
	}
	const user = await findOrCreateBuyer({
		email,
		firstName,
		lastName,
		profileImageUrl,
		googleSubject,
		googleEmailVerified: true,
	});
	return publicAuthResult(user._id.toString(), ip);
}

export async function signInWithVerifiedPhone({
	phone,
	ip,
}: {
	phone: string;
	ip: string;
}): Promise<AuthResult> {
	const existing = await getUserByVerifiedPhoneDB({ phone });
	if (existing) {
		if (!existing.isActive) throw ErrUnauthorized;
		return publicAuthResult(existing._id.toString(), ip);
	}
	const contactMatches = await getUsersByPhoneDB({ phone });
	if (contactMatches.length > 1) {
		throw validationError(
			"This number is linked to more than one account. Sign in with Google or email and update your account phone.",
		);
	}
	if (contactMatches.length === 1) {
		const match = contactMatches[0];
		if (!match.isActive) throw ErrUnauthorized;
		const verified = await markUserPhoneVerifiedDB({
			id: match._id.toString(),
			phone,
		});
		if (!verified) throw validationError("Could not verify account phone.");
		return publicAuthResult(verified._id.toString(), ip);
	}

	const buyersGroupId = await getBuiltInGroupId(BUYERS_GROUP);
	let user: IUser | null = null;
	try {
		user = await createUserDB({
			payload: {
				firstName: "Prechop",
				lastName: "Customer",
				email: `phone-${hash(phone).slice(0, 32)}@auth.prechop.local`,
				phone,
				phoneVerifiedAt: new Date(),
				groupIds: buyersGroupId ? [buyersGroupId] : [],
				isActive: true,
			},
		});
	} catch (error) {
		// Another verification may have claimed this number concurrently. The
		// partial unique index is authoritative; resolve the winning account.
		if ((error as { code?: number })?.code !== 11000) throw error;
	}

	if (!user) user = await getUserByVerifiedPhoneDB({ phone });
	if (!user) throw validationError("Could not create account.");
	if (!user.isActive) throw ErrUnauthorized;

	await recordAudit({
		userId: user._id.toString(),
		role: BUYERS_GROUP,
		action: "BUYER_REGISTER_WHATSAPP",
		resourceType: "users",
		resourceId: user._id.toString(),
	});
	return publicAuthResult(user._id.toString(), ip);
}
