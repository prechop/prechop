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
import { createPolicy, listPolicies } from "@/server/services/iam";
import { createPolicySchema } from "@/server/validators/iam/validate";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/admin/iam/policies" },
	withAuth(async ({ auth }) => {
		try {
			requirePermission(auth, "iam:policy:read");
			return ok(await listPolicies());
		} catch (error) {
			return handleError(error);
		}
	}),
);

export const POST = withApiHandler(
	{ route: "/api/admin/iam/policies" },
	withAuth(async ({ req, auth }) => {
		try {
			requirePermission(auth, "iam:policy:manage");
			const parsed = createPolicySchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const policy = await createPolicy({
				...parsed.data,
				actor: {
					userId: auth.userId,
					groups: auth.groups,
					ip: getClientIp(req),
					userAgent: getUserAgent(req),
				},
			});
			return created(policy, "Policy created");
		} catch (error) {
			return handleError(error);
		}
	}),
);
