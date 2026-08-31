import { fail, ok, withApiHandler } from "@/server/lib";
import { resolveLinkByToken } from "@/server/services/referrals/links";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/referral/resolve/[token]" },
	async ({ context }) => {
		try {
			const { token } = await (
				context as { params: Promise<{ token: string }> }
			).params;
		const result = await resolveLinkByToken({ token });
		if (!result) return fail(404, "Not found");
		return ok(result);
		} catch (e) {
			return ok(null);
		}
	},
);
