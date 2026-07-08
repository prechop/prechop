import { decodeJwtToken } from "../../constants";
import { logoutUserDB } from "../../models";

/**
 * Revoke a single session by pulling its refresh token. Best-effort — always
 * resolves so the route can clear cookies regardless.
 */
export async function logout(refreshToken: string | undefined): Promise<void> {
	if (!refreshToken) return;
	try {
		const decoded = await decodeJwtToken({ refreshToken }).catch(
			() => null,
		);
		if (!decoded) return;
		await logoutUserDB({ id: decoded.userId, refreshToken });
	} catch {
		// swallow — logout is best-effort
	}
}
