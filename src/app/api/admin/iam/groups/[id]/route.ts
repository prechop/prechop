import { ErrInvalidFields } from "@/server/constants";
import {
	getClientIp,
	getUserAgent,
	handleError,
	ok,
	requirePermission,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { deleteGroup, getGroup, updateGroup } from "@/server/services/iam";
import { updateGroupSchema } from "@/server/validators/iam/validate";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withApiHandler(
	{ route: "/api/admin/iam/groups/[id]" },
	withAuth(async ({ auth, context }) => {
		try {
			requirePermission(auth, "iam:group:read");
			const { id } = await (context as Ctx).params;
			return ok(await getGroup(id));
		} catch (error) {
			return handleError(error);
		}
	}),
);

export const PATCH = withApiHandler(
	{ route: "/api/admin/iam/groups/[id]" },
	withAuth(async ({ req, auth, context }) => {
		try {
			requirePermission(auth, "iam:group:manage");
			const { id } = await (context as Ctx).params;
			const parsed = updateGroupSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const group = await updateGroup({
				id,
				...parsed.data,
				actor: {
					userId: auth.userId,
					groups: auth.groups,
					ip: getClientIp(req),
					userAgent: getUserAgent(req),
				},
			});
			return ok(group, "Group updated");
		} catch (error) {
			return handleError(error);
		}
	}),
);

export const DELETE = withApiHandler(
	{ route: "/api/admin/iam/groups/[id]" },
	withAuth(async ({ req, auth, context }) => {
		try {
			requirePermission(auth, "iam:group:manage");
			const { id } = await (context as Ctx).params;
			await deleteGroup({
				id,
				actor: {
					userId: auth.userId,
					groups: auth.groups,
					ip: getClientIp(req),
					userAgent: getUserAgent(req),
				},
			});
			return ok({ id }, "Group deleted");
		} catch (error) {
			return handleError(error);
		}
	}),
);
