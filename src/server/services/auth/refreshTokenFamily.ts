import crypto from "node:crypto";
import { REFRESH_TOKEN_MAX_AGE_SECONDS } from "../../constants";
import { Redis } from "../../databases";

/**
 * Refresh-token reuse detection (PRD §8.1).
 *
 * `reLoginUserWithRefreshTokenDB` rotates on every use: the presented token is
 * `$pull`ed and a fresh one issued. That makes a replayed token *fail*, but a
 * bare failure is indistinguishable from an expired token — so a stolen token
 * that the thief redeems first leaves the victim's next refresh looking like a
 * routine expiry, and the thief keeps the live token forever. The whole point of
 * rotation is that a replay is *evidence of theft*: exactly one party can hold
 * the current token, so a second use of an already-rotated one means the chain
 * forked. The correct response is to kill the entire family, not just reject.
 *
 * Membership is tracked in Redis rather than on the user document because the
 * `refreshTokens` schema (models/**) is not this slice's to change. Two
 * consequences worth naming:
 *
 *  - Only **token hashes** are stored. Redis is a shared instance on this host;
 *    the raw refresh token is a bearer credential and does not belong there.
 *    Hashes are enough to recognise a replay.
 *  - Because we hold no raw token, revocation is a Redis **deny-list** checked
 *    on every refresh, not a DB purge. The family's live token row lingers in
 *    Mongo until its natural expiry but is inert: no refresh can redeem it.
 *    Already-issued access tokens still run to their (short) expiry.
 *
 * See HANDOFF: a `familyId` on the refreshTokens subdocument plus a
 * `revokeRefreshTokenFamilyDB` would move enforcement to the database and drop
 * the Redis dependency. This is the in-slice interim.
 */

const FAMILY_TTL_SECONDS = REFRESH_TOKEN_MAX_AGE_SECONDS;

/**
 * Refresh tokens are bearer credentials; key Redis by digest, never by the
 * token itself, so a Redis keyspace dump can't be replayed against the API.
 */
function digest(refreshToken: string): string {
	return crypto.createHash("sha256").update(refreshToken).digest("hex");
}

/** token digest → the family it belongs to. */
function familyOfKey(refreshToken: string): string {
	return `auth:rt:family:${digest(refreshToken)}`;
}

/** token digest → present once the token has been rotated away (spent). */
function spentKey(refreshToken: string): string {
	return `auth:rt:spent:${digest(refreshToken)}`;
}

/** family id → present once the family has been burned by a detected replay. */
function revokedKey(familyId: string): string {
	return `auth:rt:revoked:${familyId}`;
}

export interface FamilyState {
	familyId: string | null;
	/** The token was already rotated away — a second use is a replay. */
	spent: boolean;
	/** The family was burned by an earlier detected replay. */
	revoked: boolean;
}

/** Classify a presented refresh token before it is redeemed. */
export async function inspectRefreshToken(
	refreshToken: string,
): Promise<FamilyState> {
	const [familyId, spent] = await Promise.all([
		Redis.get(familyOfKey(refreshToken)),
		Redis.get(spentKey(refreshToken)),
	]);
	const revoked = familyId
		? (await Redis.get(revokedKey(familyId))) !== null
		: false;
	return { familyId, spent: spent !== null, revoked };
}

/**
 * Record a successful rotation: the old token becomes `spent`, the new token
 * inherits the family. A token presented at login (no known family) starts one.
 */
export async function recordRotation({
	presentedToken,
	issuedToken,
	familyId,
}: {
	presentedToken: string;
	issuedToken: string;
	/** Existing family, or null to start a new one (first refresh after login). */
	familyId: string | null;
}): Promise<string> {
	const family = familyId ?? crypto.randomUUID();
	await Promise.all([
		// The presented token is now rotated away. Any further use is a replay.
		Redis.setex(spentKey(presentedToken), FAMILY_TTL_SECONDS, family),
		// The successor carries the family forward.
		Redis.setex(familyOfKey(issuedToken), FAMILY_TTL_SECONDS, family),
		// Keep the presented token's family mapping alive so the replay that
		// arrives after rotation can still be attributed to this family.
		Redis.setex(familyOfKey(presentedToken), FAMILY_TTL_SECONDS, family),
	]);
	return family;
}

/**
 * Burn a family after a detected replay. Every subsequent refresh carrying a
 * token from this family is refused, including the currently-live one held by
 * whichever party is legitimate — both sides must re-authenticate, which is the
 * intended outcome when we cannot tell victim from thief.
 */
export async function revokeFamily(familyId: string): Promise<void> {
	await Redis.setex(revokedKey(familyId), FAMILY_TTL_SECONDS, "1");
}
