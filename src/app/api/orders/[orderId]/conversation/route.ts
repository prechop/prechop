import { ErrInvalidFields } from "@/server/constants";
import { handleError, ok, withApiHandler, withAuth } from "@/server/lib";
import {
	markOrderMessagesRead,
	readOrderConversation,
	sendOrderMessage,
} from "@/server/services/orderConversations";
import { sendOrderMessageSchema } from "@/server/validators/orderConversations/validate";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/orders/[orderId]/conversation" },
	withAuth(async ({ auth, context }) => {
		try {
			const { orderId } = await (
				context as { params: Promise<{ orderId: string }> }
			).params;
			return ok(await readOrderConversation({ auth, orderId }));
		} catch (error) {
			return handleError(error);
		}
	}),
);
export const POST = withApiHandler(
	{
		route: "/api/orders/[orderId]/conversation",
		rateLimit: { windowMs: 60 * 1000, maxRequests: 20 },
	},
	withAuth(async ({ req, auth, context }) => {
		try {
			const { orderId } = await (
				context as { params: Promise<{ orderId: string }> }
			).params;
			const parsed = sendOrderMessageSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			return ok(
				await sendOrderMessage({
					auth,
					orderId,
					message: parsed.data.message,
					clientMessageId: parsed.data.clientMessageId,
				}),
			);
		} catch (error) {
			return handleError(error);
		}
	}),
);

export const PATCH = withApiHandler(
	{ route: "/api/orders/[orderId]/conversation/read" },
	withAuth(async ({ auth, context }) => {
		try {
			const { orderId } = await (
				context as { params: Promise<{ orderId: string }> }
			).params;
			return ok(await markOrderMessagesRead({ auth, orderId }));
		} catch (error) {
			return handleError(error);
		}
	}),
);
