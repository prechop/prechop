import { z } from "zod";
import { DailyOrderStatus } from "@/server/models";

const optionInputSchema = z.object({
	name: z.string().min(1).max(120),
	priceNaira: z.number().nonnegative(),
});

const optionGroupInputSchema = z
	.object({
		sourceGroupId: z.string().nullish(),
		name: z.string().min(1).max(120),
		required: z.boolean().optional(),
		minSelect: z.number().int().min(0).optional(),
		maxSelect: z.number().int().positive().nullish(),
		options: z.array(optionInputSchema).min(1),
	})
	.superRefine((g, ctx) => {
		if (g.required && (g.minSelect ?? 0) < 1)
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "A required group must allow at least one selection.",
			});
		if ((g.minSelect ?? 0) > g.options.length)
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "minSelect cannot exceed the number of options.",
			});
		if (g.maxSelect != null && g.maxSelect < (g.minSelect ?? 0))
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "maxSelect cannot be less than minSelect.",
			});
	});

const dailyOrderItemInputSchema = z.object({
	menuItemId: z.string().min(1),
	maxQuantity: z.number().int().positive().nullish(),
	optionGroups: z.array(optionGroupInputSchema).optional(),
});

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Orders may not close later than the menu date's day. `scheduledDate` arrives
 * as the start (midnight) of the picked day, so the last valid close instant is
 * one day later. The single-timezone (WAT) client and this check agree to within
 * the harmless sub-day tolerance the `+ ONE_DAY_MS` window allows.
 */
export function isCutoffWithinMenuDay(
	scheduledDate: Date,
	cutoffTime: Date,
): boolean {
	return cutoffTime.getTime() <= scheduledDate.getTime() + ONE_DAY_MS;
}

function cutoffWithinMenuDay(
	scheduledDate: string,
	cutoffTime: string,
): boolean {
	return isCutoffWithinMenuDay(new Date(scheduledDate), new Date(cutoffTime));
}

export const createDailyOrderSchema = z
	.object({
		title: z.string().min(1),
		scheduledDate: z.string().datetime(),
		availableFrom: z.string().datetime().optional(),
		cutoffTime: z.string().datetime(),
		pickupAvailable: z.boolean().optional(),
		deliveryAvailable: z.boolean().optional(),
		deliveryFeeKobo: z.number().int().nonnegative().optional(),
		draft: z.boolean().optional(),
		items: z.array(dailyOrderItemInputSchema).min(1),
	})
	.refine((v) => cutoffWithinMenuDay(v.scheduledDate, v.cutoffTime), {
		message: "Orders must close on or before the menu date.",
		path: ["cutoffTime"],
	});

export const createFromTemplateSchema = z
	.object({
		title: z.string().min(1),
		scheduledDate: z.string().datetime(),
		availableFrom: z.string().datetime().optional(),
		cutoffTime: z.string().datetime(),
		pickupAvailable: z.boolean().optional(),
		deliveryAvailable: z.boolean().optional(),
		deliveryFeeKobo: z.number().int().nonnegative().optional(),
		draft: z.boolean().optional(),
	})
	.refine((v) => cutoffWithinMenuDay(v.scheduledDate, v.cutoffTime), {
		message: "Orders must close on or before the menu date.",
		path: ["cutoffTime"],
	});

export const updateDailyOrderDraftSchema = z.object({
	title: z.string().min(1).optional(),
	scheduledDate: z.string().datetime().optional(),
	availableFrom: z.string().datetime().optional(),
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

export const marketplaceSearchSchema = z
	.object({
		campusId: z.string().min(1),
		q: z.string().trim().min(1).max(80),
		limit: z.coerce.number().int().positive().max(50).optional(),
	})
	.strict();

export const myDailyOrdersQuerySchema = z
	.object({
		status: z.nativeEnum(DailyOrderStatus).optional(),
		// Case-insensitive title search.
		q: z.string().trim().min(1).max(80).optional(),
		// Inclusive scheduledDate range (coerced from ISO/date strings).
		from: z.coerce.date().optional(),
		to: z.coerce.date().optional(),
		limit: z.coerce.number().int().positive().max(100).optional(),
		offset: z.coerce.number().int().min(0).optional(),
	})
	.strict()
	.refine((v) => !(v.from && v.to) || v.from <= v.to, {
		message: "`from` must not be after `to`.",
		path: ["from"],
	});

export type CreateDailyOrderInput = z.infer<typeof createDailyOrderSchema>;
export type CreateFromTemplateInput = z.infer<typeof createFromTemplateSchema>;
export type UpdateDailyOrderDraftInput = z.infer<
	typeof updateDailyOrderDraftSchema
>;
export type DailyOrderItemInput = z.infer<typeof dailyOrderItemInputSchema>;
