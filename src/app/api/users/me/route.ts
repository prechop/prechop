import {
	clearAuthCookies,
	clearAuthCookiesOnResponse,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import {
	deactivateAccount,
	getMe,
	updateProfile,
} from "@/server/services/users";
import {
	parseDeleteAccount,
	parseUpdateProfile,
} from "@/server/validators/users/validate";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/users/me" },
	withAuth(async ({ auth }) => {
		try {
			return ok(await getMe({ userId: auth.userId }));
		} catch (e) {
			return handleError(e);
		}
	}),
);

export const PATCH = withApiHandler(
	{ route: "/api/users/me" },
	withAuth(async ({ req, auth }) => {
		try {
			const body = parseUpdateProfile(await req.json());
			return ok(
				await updateProfile({
					userId: auth.userId,
					firstName: body.firstName,
					lastName: body.lastName,
				}),
			);
		} catch (e) {
			return handleError(e);
		}
	}),
);

export const DELETE = withApiHandler(
	{ route: "/api/users/me" },
	withAuth(async ({ req, auth }) => {
		try {
			const body = parseDeleteAccount(await req.json());
			const result = await deactivateAccount({
				userId: auth.userId,
				authenticatedAt: auth.token.date,
				...body,
			});
			await clearAuthCookies();
			const response = ok(result);
			clearAuthCookiesOnResponse(response);
			return response;
		} catch (e) {
			return handleError(e);
		}
	}),
);
