import { ErrInvalidFields } from "@/server/constants";
import {
	handleError,
	ok,
	requirePermission,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { openDisputeForOrder } from "@/server/services/admin";
import { openOrderDisputeSchema } from "@/server/validators/admin/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/admin/orders/[id]/disputes" },
	withAuth(async ({ req, auth, context }) => {
		try {
			requirePermission(auth, "support:update");
			const { id } = await (
				context as { params: Promise<{ id: string }> }
			).params;
			const parsed = openOrderDisputeSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const dispute = await openDisputeForOrder({
				orderId: id,
				reason: parsed.data.reason,
				buyerNotes: parsed.data.buyerNotes,
				vendorNotes: parsed.data.vendorNotes,
				photos: parsed.data.photos,
				messages: parsed.data.messages,
			});
			return ok(dispute);
		} catch (error) {
			return handleError(error);
		}
	}),
);
