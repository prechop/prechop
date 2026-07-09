import { z as zod } from "zod";
import { FulfillmentType, OrderStatus } from "../../models/enums";

export const placeOrderBodySchema = zod
	.object({
		dailyOrderId: zod.string().min(1),
		fulfillmentType: zod.enum([
			FulfillmentType.PICKUP,
			FulfillmentType.DELIVERY,
		]),
		deliveryHostelName: zod.string().optional(),
		deliveryRoomNumber: zod.string().optional(),
		deliveryAdditionalInfo: zod.string().optional(),
		items: zod
			.array(
				zod
					.object({
						dailyOrderItemId: zod.string().min(1),
						quantity: zod.coerce.number().int().min(1).max(50),
						selectedOptionIds: zod.array(zod.string()).optional(),
					})
					.strict(),
			)
			.min(1),
	})
	.strict();

export const updateOrderStatusBodySchema = zod
	.object({
		status: zod.enum([
			OrderStatus.CONFIRMED,
			OrderStatus.PREPARING,
			OrderStatus.READY,
			OrderStatus.COMPLETED,
		]),
	})
	.strict();

export const cancelOrderBodySchema = zod
	.object({ reason: zod.string().min(1).max(500) })
	.strict();

export const ordersQuerySchema = zod
	.object({
		limit: zod.coerce.number().int().min(1).max(50).optional(),
		offset: zod.coerce.number().int().min(0).optional(),
	})
	.strict();

export type PlaceOrderBody = zod.infer<typeof placeOrderBodySchema>;
