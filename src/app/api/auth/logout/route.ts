import {
	clearAuthCookies,
	clearAuthCookiesOnResponse,
	getCookieValue,
	getRequestCookieValue,
	handleError,
	ok,
	REFRESH_COOKIE,
	withApiHandler,
} from "@/server/lib";
import { logout } from "@/server/services/auth";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/auth/logout" },
	async ({ req }) => {
		try {
			const refreshToken =
				getRequestCookieValue(req, REFRESH_COOKIE) ??
				(await getCookieValue(REFRESH_COOKIE));
			await logout(refreshToken ?? undefined);
			await clearAuthCookies();
			const response = ok({ message: "Logged out successfully." });
			clearAuthCookiesOnResponse(response);
			return response;
		} catch (error) {
			return handleError(error);
		}
	},
);
