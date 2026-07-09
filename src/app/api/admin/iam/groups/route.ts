import { ErrInvalidFields } from "@/server/constants";
import {
	created,
	getClientIp,
	getUserAgent,
	handleError,
	ok,
	requirePermission,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { createGroup, listGroups } from "@/server/services/iam";
import { createGroupSchema } from "@/server/validators/iam/validate";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/admin/iam/groups" },
	withAuth(async ({ auth }) => {
		try {
			requirePermission(auth, "iam:group:read");
			return ok(await listGroups());
		} catch (error) {
			return handleError(error);
		}
	}),
);

export const POST = withApiHandler(
	{ route: "/api/admin/iam/groups" },
	withAuth(async ({ req, auth }) => {
		try {
			requirePermission(auth, "iam:group:manage");
			const parsed = createGroupSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const group = await createGroup({
				...parsed.data,
				actor: {
					userId: auth.userId,
					groups: auth.groups,
					ip: getClientIp(req),
					userAgent: getUserAgent(req),
				},
			});
			return created(group, "Group created");
		} catch (error) {
			return handleError(error);
		}
	}),
);
