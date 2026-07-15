import { sign } from "jsonwebtoken";
import {
	ACCESS_TOKEN_MAX_AGE_SECONDS,
	JWT_ACCESS_TOKEN_SECRET,
	JWT_REFRESH_TOKEN_SECRET,
	REFRESH_TOKEN_MAX_AGE_SECONDS,
} from "../../constants";
import type { IJwtPayload } from "../../types";

/**
 * Conservative address check. Deliberately not an RFC 5322 parser: this guards a
 * best-effort notification field, so it rejects the obviously-wrong (no `@`, no
 * dot in the domain, whitespace, over-length) and lets the mail provider be the
 * final judge of deliverability. 254 is the RFC 5321 maximum path length.
 */
export const EMAIL_MAX_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Fold an address to its stored form: trimmed and lowercased. Returns `null`
 * when the input is empty (meaning "clear it") and `undefined` when the input is
 * present but not a valid address (meaning "reject it") — callers must
 * distinguish the two.
 */
export function normalizeEmail(value: string): string | null | undefined {
	const trimmed = value.trim().toLowerCase();
	if (trimmed === "") return null;
	if (trimmed.length > EMAIL_MAX_LENGTH) return undefined;
	return EMAIL_PATTERN.test(trimmed) ? trimmed : undefined;
}

/** Schema-level predicate: a stored address must be normalized and valid. */
export function isStorableEmail(value: unknown): boolean {
	if (typeof value !== "string") return false;
	return normalizeEmail(value) === value;
}

export async function generateAuthToken({
	userId,
	ip,
	shouldRegenerateRefreshToken,
}: {
	userId: string;
	ip: string;
	shouldRegenerateRefreshToken: boolean;
}): Promise<IJwtPayload | null> {
	try {
		const currentDate = new Date();
		const expirationDate = new Date(
			Date.now() + ACCESS_TOKEN_MAX_AGE_SECONDS * 1000,
		);
		const refreshTokenExpiresIn = new Date(
			Date.now() + REFRESH_TOKEN_MAX_AGE_SECONDS * 1000,
		);

		let refreshToken = "";
		if (shouldRegenerateRefreshToken) {
			const payload: IJwtPayload = {
				userId,
				date: currentDate,
				accessToken: "",
				expiresIn: expirationDate,
				ip,
				refreshToken: "",
				refreshTokenExpiresIn,
			};
			const signed = sign({ data: payload }, JWT_REFRESH_TOKEN_SECRET, {
				algorithm: "HS256",
				expiresIn: REFRESH_TOKEN_MAX_AGE_SECONDS,
			});
			if (!signed) return null;
			refreshToken = signed;
		}

		const jwtSigningPayload = {
			userId,
			date: currentDate,
			expiresIn: expirationDate,
			ip,
			refreshTokenExpiresIn,
		};
		const accessToken = sign(
			{ data: jwtSigningPayload },
			JWT_ACCESS_TOKEN_SECRET,
			{ algorithm: "HS256", expiresIn: ACCESS_TOKEN_MAX_AGE_SECONDS },
		);

		return { ...jwtSigningPayload, accessToken, refreshToken };
	} catch {
		return null;
	}
}
