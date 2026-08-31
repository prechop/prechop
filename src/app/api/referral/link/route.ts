import { ErrForbidden, ErrInvalidFields } from "@/server/constants";
import { handleError, ok, withApiHandler, withAuth } from "@/server/lib";
import { getOrCreateLink } from "@/server/services/referrals/links";
import { getVendorProfileByUserIdDB } from "@/server/models";
import { z as zod } from "zod";

const createLinkSchema = zod
	.object({
		vendorId: zod.string().min(1).optional(),
	})
	.strict();

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/referral/link" },
	withAuth(async ({ req, auth }) => {
		try {
			const parsed = createLinkSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;

			const targetVendorId = parsed.data.vendorId?.trim();
			let vendorId = targetVendorId;

			if (!vendorId) {
				const vendor = await getVendorProfileByUserIdDB({ userId: auth.userId });
				if (!vendor) throw ErrForbidden;
				vendorId = vendor._id.toString();
			}

			const link = await getOrCreateLink({
				vendorId,
				creatorUserId: auth.userId,
			});

			return ok({
				token: link.token,
				url: `${process.env.APP_URL ?? "http://localhost:3000"}/r/${link.token}`,
				createdAt: link.createdAt,
			});
		} catch (e) {
			return handleError(e);
		}
	}),
);
