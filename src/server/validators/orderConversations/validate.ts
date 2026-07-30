import { z as zod } from "zod";

export const listOrderConversationsQuerySchema = zod.object({
	limit: zod.coerce.number().int().min(1).max(100).optional(),
});

export const sendOrderMessageSchema = zod.object({
	message: zod.string().trim().min(1).max(1000),
	clientMessageId: zod.string().trim().min(1).max(80).optional(),
});
