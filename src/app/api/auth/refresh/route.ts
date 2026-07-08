import { decodeJwtToken, ErrUnauthorized } from "@/server/constants";
import {
	getClientIp,
	getCookieValue,
	handleError,
	ok,
	REFRESH_COOKIE,
	setAuthCookies,
	withApiHandler,
} from "@/server/lib";
import reLoginUserWithRefreshToken from "@/server/services/auth/reLoginUserWithRefreshToken";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/auth/refresh" },
	async ({ req }) => {
		try {
			const refreshToken = await getCookieValue(REFRESH_COOKIE);
			if (!refreshToken) throw ErrUnauthorized;
			const decoded = await decodeJwtToken({ refreshToken }).catch(
				() => null,
			);
			if (!decoded) throw ErrUnauthorized;
			const token = await reLoginUserWithRefreshToken({
				id: decoded.userId,
				refreshToken,
				ip: decoded.ip || getClientIp(req),
			});
			if (!token) throw ErrUnauthorized;
			await setAuthCookies(token);
			return ok({ accessToken: token.accessToken });
		} catch (error) {
			return handleError(error);
		}
	},
);
