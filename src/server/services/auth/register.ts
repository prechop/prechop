import { randomBytes } from "node:crypto";
import {
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
	linkGoogleUserDB,
	loginUserDB,
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

function cleanNext(next?: string | null): string {
	if (!next?.startsWith("/") || next.startsWith("//")) return "/marketplace";
	return next;
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
	const returnTo = cleanNext(next);
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
		next: cleanNext(next ?? data.next),
	};
}

export async function createGoogleAuthState(next?: string): Promise<string> {
	const state = makeToken();
	await Redis.setex(
		googleStateKey(state),
		GOOGLE_STATE_TTL_SECONDS,
		JSON.stringify({ next: cleanNext(next) }),
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
	return { next: cleanNext(data.next) };
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
