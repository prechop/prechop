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
import { setUserDirectPolicies } from "@/server/services/iam";
import { setUserPoliciesSchema } from "@/server/validators/iam/validate";

export const runtime = "nodejs";

export const PUT = withApiHandler(
	{ route: "/api/admin/iam/users/[id]/policies" },
	withAuth(async ({ req, auth, context }) => {
		try {
			requirePermission(auth, "iam:user:update");
			const { id } = await (
				context as { params: Promise<{ id: string }> }
			).params;
			const parsed = setUserPoliciesSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const view = await setUserDirectPolicies({
				targetId: id,
				policyIds: parsed.data.policyIds,
				actor: {
					userId: auth.userId,
					groups: auth.groups,
					ip: getClientIp(req),
					userAgent: getUserAgent(req),
				},
			});
			return ok(view, "Policies updated");
		} catch (error) {
			return handleError(error);
		}
	}),
);
