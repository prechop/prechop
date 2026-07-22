import { z as zod } from "zod";
import { FulfillmentType, OrderStatus } from "../../models/enums";

export const placeOrderBodySchema = zod
	.object({
		dailyOrderId: zod.string().min(1),
		paymentMode: zod.enum(["SELF", "PAY_FOR_ME"]).optional(),
		fulfillmentType: zod.enum([
			FulfillmentType.PICKUP,
			FulfillmentType.DELIVERY,
		]),
		deliveryHostelName: zod.string().optional(),
		deliveryRoomNumber: zod.string().optional(),
		deliveryAdditionalInfo: zod.string().optional(),
		deliveryPhone: zod.string().trim().min(5).max(30).optional(),
		customerMessage: zod.string().trim().max(150).optional(),
		items: zod
			.array(
				zod
					.object({
						dailyOrderItemId: zod.string().min(1),
						quantity: zod.coerce.number().int().min(1).max(50),
						selectedOptionIds: zod.array(zod.string()).optional(),
						selectedOptions: zod
							.array(
								zod
									.object({
										optionId: zod.string().min(1),
										quantity: zod.coerce
											.number()
											.int()
											.min(1)
											.max(50),
									})
									.strict(),
							)
							.optional(),
					})
					.strict(),
			)
			.min(1),
	})
	.strict();

export const updateOrderStatusBodySchema = zod
	.object({
		status: zod.enum([
			OrderStatus.ACCEPTED,
			OrderStatus.VENDOR_REJECTED,
			OrderStatus.CONFIRMED,
			OrderStatus.COOKING,
			OrderStatus.PREPARING,
			OrderStatus.READY,
			OrderStatus.IN_TRANSIT,
			OrderStatus.COMPLETED,
		]),
	})
	.strict();

export const cancelOrderBodySchema = zod
	.object({ reason: zod.string().min(1).max(500) })
	.strict();

export const confirmHandoverBodySchema = zod
	.object({
		method: zod.enum(["QR", "PIN"]),
		code: zod.string().trim().min(1).max(256),
	})
	.strict();

export const pickupNoShowResponseBodySchema = zod
	.object({
		response: zod.enum(["CONFIRMED_COLLECTION", "PROBLEM_REPORTED"]),
		note: zod.string().trim().min(1).max(500).optional(),
	})
	.strict();

export const buyerUnreachableBodySchema = zod
	.object({
		arrivalTime: zod.coerce.date(),
		contactAttempts: zod.coerce.number().int().min(1).max(20),
		note: zod.string().trim().min(1).max(500),
		photoUrl: zod.string().trim().url().max(2048).optional(),
	})
	.strict();

export const externalPaymentInitializeSchema = zod
	.object({
		contact: zod.string().trim().min(5).max(160),
	})
	.strict();

export const ordersQuerySchema = zod
	.object({
		limit: zod.coerce.number().int().min(1).max(50).optional(),
		offset: zod.coerce.number().int().min(0).optional(),
	})
	.strict();

export type PlaceOrderBody = zod.infer<typeof placeOrderBodySchema>;
