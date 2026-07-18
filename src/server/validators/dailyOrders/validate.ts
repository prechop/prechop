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

const deliveryFields = {
	deliveryCoverage: z.string().trim().min(2).max(240).optional(),
	deliveryEstimateMinutes: z.number().int().positive().max(240).optional(),
	deliveryContactPhone: z.string().trim().min(5).max(30).optional(),
	deliveryResponsibilityAccepted: z.boolean().optional(),
};

function requireDeliveryDetails<
	T extends {
		deliveryAvailable?: boolean;
		deliveryFeeKobo?: number;
		deliveryCoverage?: string;
		deliveryEstimateMinutes?: number;
		deliveryContactPhone?: string;
		deliveryResponsibilityAccepted?: boolean;
	},
>(data: T, ctx: z.RefinementCtx) {
	if (!data.deliveryAvailable) return;
	if (data.deliveryFeeKobo == null) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["deliveryFeeKobo"],
			message: "Delivery fee is required when delivery is enabled.",
		});
	}
	for (const key of [
		"deliveryCoverage",
		"deliveryEstimateMinutes",
		"deliveryContactPhone",
	] as const) {
		if (!data[key]) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: [key],
				message: "Required when delivery is enabled.",
			});
		}
	}
	if (!data.deliveryResponsibilityAccepted) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["deliveryResponsibilityAccepted"],
			message: "Vendor-managed delivery confirmation is required.",
		});
	}
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
		...deliveryFields,
		draft: z.boolean().optional(),
		items: z.array(dailyOrderItemInputSchema).min(1),
	})
	.superRefine(requireDeliveryDetails);

export const createFromTemplateSchema = z
	.object({
		title: z.string().min(1),
		scheduledDate: z.string().datetime(),
		availableFrom: z.string().datetime().optional(),
		cutoffTime: z.string().datetime(),
		pickupAvailable: z.boolean().optional(),
		deliveryAvailable: z.boolean().optional(),
		deliveryFeeKobo: z.number().int().nonnegative().optional(),
		...deliveryFields,
		draft: z.boolean().optional(),
	})
	.superRefine(requireDeliveryDetails);

export const updateDailyOrderDraftSchema = z
	.object({
		title: z.string().min(1).optional(),
		scheduledDate: z.string().datetime().optional(),
		availableFrom: z.string().datetime().optional(),
		cutoffTime: z.string().datetime().optional(),
		pickupAvailable: z.boolean().optional(),
		deliveryAvailable: z.boolean().optional(),
		deliveryFeeKobo: z.number().int().nonnegative().optional(),
		...deliveryFields,
		items: z.array(dailyOrderItemInputSchema).optional(),
	})
	.superRefine(requireDeliveryDetails);

export const marketplaceQuerySchema = z
	.object({
		campusId: z.string().min(1).optional(),
		limit: z.coerce.number().int().positive().max(50).optional(),
		offset: z.coerce.number().int().min(0).optional(),
	})
	.strict();

export const marketplaceSearchSchema = z
	.object({
		campusId: z.string().min(1).optional(),
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
