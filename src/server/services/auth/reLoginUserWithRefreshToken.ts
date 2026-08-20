import crypto from "node:crypto";
import {
	decodeJwtToken,
	ErrTokenCompromised,
	serviceUnavailable,
} from "../../constants";
import {
	logoutUserDB,
	reLoginUserWithRefreshTokenDB,
	restoreRefreshTokenAfterFailedRotationDB,
} from "../../models";
import {
	acquireRotationLock,
	getRotationHandoff,
	inspectRefreshToken,
	recordRotation,
	releaseRotationLock,
	revokeFamily,
	waitForRotationHandoff,
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
	// A completed rotation is idempotent for a short overlap window. This is the
	// normal path for parallel API calls, page reloads, and several browser tabs.
	const existingHandoff = await getRotationHandoff(refreshToken);
	if (existingHandoff) return existingHandoff;

	const owner = crypto.randomUUID();
	const acquired = await acquireRotationLock(refreshToken, owner);
	if (!acquired) {
		const handoff = await waitForRotationHandoff(refreshToken);
		if (handoff) return handoff;
		throw serviceUnavailable(
			"Session refresh is temporarily unavailable. Please try again.",
			"AUTH_REFRESH_UNAVAILABLE",
		);
	}

	try {
		// State may have changed while this request waited to acquire the lock.
		const racedHandoff = await getRotationHandoff(refreshToken);
		if (racedHandoff) return racedHandoff;
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

		// Rotation succeeded — atomically publish replay metadata plus the encrypted
		// handoff. If publication fails, restore the original Mongo credential so
		// the browser is never stranded with an already-consumed token.
		try {
			await recordRotation({
				presentedToken: refreshToken,
				issuedToken: result.refreshToken,
				issuedPayload: result,
				familyId: state.familyId,
			});
		} catch (error) {
			const original = await decodeJwtToken({ refreshToken });
			if (!original) throw error;
			await restoreRefreshTokenAfterFailedRotationDB({
				id,
				presentedToken: refreshToken,
				replacementToken: result.refreshToken,
				deadline: original.refreshTokenExpiresIn,
				absoluteDeadline: original.refreshTokenAbsoluteExpiresIn,
			});
			throw error;
		}

		return result;
	} finally {
		await releaseRotationLock(refreshToken, owner).catch(() => undefined);
	}
}
