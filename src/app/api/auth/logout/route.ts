import {
	clearAuthCookies,
	getCookieValue,
	handleError,
	ok,
	REFRESH_COOKIE,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { logout } from "@/server/services/auth";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/auth/logout" },
	withAuth(async () => {
		try {
			const refreshToken = await getCookieValue(REFRESH_COOKIE);
			await logout(refreshToken ?? undefined);
			await clearAuthCookies();
			return ok({ message: "Logged out successfully." });
		} catch (error) {
			return handleError(error);
		}
	}),
);
