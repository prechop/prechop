import { z } from "zod";
import { DailyOrderStatus } from "@/server/models";

const addonInputSchema = z.object({
	name: z.string().min(1),
	priceNaira: z.number().nonnegative(),
});

const dailyOrderItemInputSchema = z.object({
	menuItemId: z.string().min(1),
	maxQuantity: z.number().int().positive().nullish(),
	addons: z.array(addonInputSchema).optional(),
});

export const createDailyOrderSchema = z.object({
	title: z.string().min(1),
	scheduledDate: z.string().datetime(),
	cutoffTime: z.string().datetime(),
	pickupAvailable: z.boolean().optional(),
	deliveryAvailable: z.boolean().optional(),
	deliveryFeeKobo: z.number().int().nonnegative().optional(),
	draft: z.boolean().optional(),
	items: z.array(dailyOrderItemInputSchema).min(1),
});

export const createFromTemplateSchema = z.object({
	title: z.string().min(1),
	scheduledDate: z.string().datetime(),
	cutoffTime: z.string().datetime(),
	pickupAvailable: z.boolean().optional(),
	deliveryAvailable: z.boolean().optional(),
	deliveryFeeKobo: z.number().int().nonnegative().optional(),
	draft: z.boolean().optional(),
});

export const updateDailyOrderDraftSchema = z.object({
	title: z.string().min(1).optional(),
	scheduledDate: z.string().datetime().optional(),
	cutoffTime: z.string().datetime().optional(),
	pickupAvailable: z.boolean().optional(),
	deliveryAvailable: z.boolean().optional(),
	deliveryFeeKobo: z.number().int().nonnegative().optional(),
	items: z.array(dailyOrderItemInputSchema).optional(),
});

export const marketplaceQuerySchema = z
	.object({
		campusId: z.string().min(1),
		limit: z.coerce.number().int().positive().max(20).optional(),
		offset: z.coerce.number().int().min(0).optional(),
	})
	.strict();

export const myDailyOrdersQuerySchema = z
	.object({
		status: z.nativeEnum(DailyOrderStatus).optional(),
		limit: z.coerce.number().int().positive().max(100).optional(),
		offset: z.coerce.number().int().min(0).optional(),
	})
	.strict();

export type CreateDailyOrderInput = z.infer<typeof createDailyOrderSchema>;
export type CreateFromTemplateInput = z.infer<typeof createFromTemplateSchema>;
export type UpdateDailyOrderDraftInput = z.infer<
	typeof updateDailyOrderDraftSchema
>;
export type DailyOrderItemInput = z.infer<typeof dailyOrderItemInputSchema>;
