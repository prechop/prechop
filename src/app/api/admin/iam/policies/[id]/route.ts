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
import { deletePolicy, getPolicy, updatePolicy } from "@/server/services/iam";
import { updatePolicySchema } from "@/server/validators/iam/validate";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withApiHandler(
	{ route: "/api/admin/iam/policies/[id]" },
	withAuth(async ({ auth, context }) => {
		try {
			requirePermission(auth, "iam:policy:read");
			const { id } = await (context as Ctx).params;
			return ok(await getPolicy(id));
		} catch (error) {
			return handleError(error);
		}
	}),
);

export const PATCH = withApiHandler(
	{ route: "/api/admin/iam/policies/[id]" },
	withAuth(async ({ req, auth, context }) => {
		try {
			requirePermission(auth, "iam:policy:manage");
			const { id } = await (context as Ctx).params;
			const parsed = updatePolicySchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const policy = await updatePolicy({
				id,
				...parsed.data,
				actor: {
					userId: auth.userId,
					groups: auth.groups,
					ip: getClientIp(req),
					userAgent: getUserAgent(req),
				},
			});
			return ok(policy, "Policy updated");
		} catch (error) {
			return handleError(error);
		}
	}),
);

export const DELETE = withApiHandler(
	{ route: "/api/admin/iam/policies/[id]" },
	withAuth(async ({ req, auth, context }) => {
		try {
			requirePermission(auth, "iam:policy:manage");
			const { id } = await (context as Ctx).params;
			await deletePolicy({
				id,
				actor: {
					userId: auth.userId,
					groups: auth.groups,
					ip: getClientIp(req),
					userAgent: getUserAgent(req),
				},
			});
			return ok({ id }, "Policy deleted");
		} catch (error) {
			return handleError(error);
		}
	}),
);
