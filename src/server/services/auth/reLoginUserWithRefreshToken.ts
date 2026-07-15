import { ErrTokenCompromised } from "../../constants";
import { logoutUserDB, reLoginUserWithRefreshTokenDB } from "../../models";
import {
	inspectRefreshToken,
	recordRotation,
	revokeFamily,
} from "./refreshTokenFamily";

/**
 * Redeem a refresh token, rotating it. Detects replay of an already-rotated
 * token and burns the whole family rather than merely refusing the request —
 * see `refreshTokenFamily.ts` for why a bare rejection is not enough.
 *
 * Throws `ErrTokenCompromised` (401) on a detected replay so the caller can
 * clear cookies and force a fresh sign-in. Returns null for the ordinary
 * "expired / unknown token" case, preserving the existing contract.
 */
export default async function reLoginUserWithRefreshToken({
	id,
	refreshToken,
	ip,
}: {
	id: string;
	refreshToken: string;
	ip: string;
}): Promise<ReturnType<typeof reLoginUserWithRefreshTokenDB>> {
	const state = await inspectRefreshToken(refreshToken);

	// The family was burned by an earlier replay. Refuse every descendant,
	// including the token the legitimate holder still has.
	if (state.revoked) throw ErrTokenCompromised;

	// This exact token was already rotated away. Only one party can hold the
	// current token, so a second presentation means the chain forked: either a
	// thief is replaying a stolen token, or the legitimate client is replaying
	// one a thief already spent. We cannot tell which — burn the family.
	if (state.spent) {
		if (state.familyId) await revokeFamily(state.familyId);
		// Best-effort DB cleanup: pull this token if it somehow still exists.
		// The family's *live* token can't be pulled (we hold only hashes), but
		// the deny-list above already makes it unredeemable.
		await logoutUserDB({ id, refreshToken }).catch(() => false);
		throw ErrTokenCompromised;
	}

	const result = await reLoginUserWithRefreshTokenDB({
		id,
		refreshToken,
		ip,
	});
	if (!result) return null;

	// Rotation succeeded — mark the spent token and carry the family forward.
	// Never let bookkeeping failure break a legitimate refresh: the token is
	// already rotated in Mongo and the caller is entitled to the new one.
	try {
		await recordRotation({
			presentedToken: refreshToken,
			issuedToken: result.refreshToken,
			familyId: state.familyId,
		});
	} catch (error) {
		console.error("[auth] refresh-token family bookkeeping failed:", error);
	}

	return result;
}
