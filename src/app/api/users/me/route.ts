import { ErrInvalidFields } from "@/server/constants";
import { handleError, ok, withApiHandler, withAuth } from "@/server/lib";
import {
	deactivateAccount,
	getMe,
	updateProfile,
} from "@/server/services/users";
import { parseUpdateProfile } from "@/server/validators/users/validate";

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
			const raw: unknown = await req.json();
			// `email` is a best-effort contact field whose *value* is validated in
			// updateProfile (400 on malformed, `""` clears it), not by the strict
			// name-only profile schema — which would reject the whole body for the
			// unknown key. Pull it out before parsing, then let the strict parse
			// still guard the name fields and reject any other unknown keys.
			const isRecord =
				typeof raw === "object" && raw !== null && !Array.isArray(raw);
			const { email, ...profile } = isRecord
				? (raw as Record<string, unknown>)
				: { email: undefined };
			const body = parseUpdateProfile(isRecord ? profile : raw);
			if (email !== undefined && typeof email !== "string") {
				throw ErrInvalidFields;
			}
			return ok(
				await updateProfile({
					userId: auth.userId,
					firstName: body.firstName,
					lastName: body.lastName,
					email,
				}),
			);
		} catch (e) {
			return handleError(e);
		}
	}),
);

export const DELETE = withApiHandler(
	{ route: "/api/users/me" },
	withAuth(async ({ auth }) => {
		try {
			return ok(await deactivateAccount({ userId: auth.userId }));
		} catch (e) {
			return handleError(e);
		}
	}),
);
