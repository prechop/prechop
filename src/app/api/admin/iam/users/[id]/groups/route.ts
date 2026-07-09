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
import { setUserGroups } from "@/server/services/iam";
import { setUserGroupsSchema } from "@/server/validators/iam/validate";

export const runtime = "nodejs";

export const PUT = withApiHandler(
	{ route: "/api/admin/iam/users/[id]/groups" },
	withAuth(async ({ req, auth, context }) => {
		try {
			requirePermission(auth, "iam:user:update");
			const { id } = await (
				context as { params: Promise<{ id: string }> }
			).params;
			const parsed = setUserGroupsSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const view = await setUserGroups({
				targetId: id,
				groupIds: parsed.data.groupIds,
				actor: {
					userId: auth.userId,
					groups: auth.groups,
					ip: getClientIp(req),
					userAgent: getUserAgent(req),
				},
			});
			return ok(view, "Groups updated");
		} catch (error) {
			return handleError(error);
		}
	}),
);
