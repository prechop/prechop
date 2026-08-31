import { z as zod } from "zod";
import { MealTime } from "@/server/models";

export const createDeliveryWindowSchema = zod
	.object({
		name: zod.string().trim().min(1).max(120).optional(),
		mealTime: zod.enum(MealTime),
		orderWindowStart: zod.string().regex(/^\d{2}:\d{2}$/, {
			message: "Order window start must be HH:MM.",
		}),
		orderWindowEnd: zod.string().regex(/^\d{2}:\d{2}$/, {
			message: "Order window end must be HH:MM.",
		}),
		deliveryWindowStart: zod.string().regex(/^\d{2}:\d{2}$/, {
			message: "Delivery window start must be HH:MM.",
		}),
		deliveryWindowEnd: zod.string().regex(/^\d{2}:\d{2}$/, {
			message: "Delivery window end must be HH:MM.",
		}),
		capacity: zod.number().int().min(1),
		active: zod.boolean().optional(),
	})
	.strict()
	.superRefine((val, ctx) => {
		if (val.orderWindowEnd === val.orderWindowStart) {
			ctx.addIssue({
				code: zod.ZodIssueCode.custom,
				message: "Order window end must be after start.",
				path: ["orderWindowEnd"],
			});
		}
		if (val.deliveryWindowEnd === val.deliveryWindowStart) {
			ctx.addIssue({
				code: zod.ZodIssueCode.custom,
				message: "Delivery window end must be after start.",
				path: ["deliveryWindowEnd"],
			});
		}
		if (val.orderWindowEnd > val.deliveryWindowStart) {
			ctx.addIssue({
				code: zod.ZodIssueCode.custom,
				message: "Order window end must be at or before delivery window start.",
				path: ["orderWindowEnd"],
			});
		}
	});

export const updateDeliveryWindowSchema = zod
	.object({
		name: zod
			.string()
			.trim()
			.max(120)
			.optional()
		,
		mealTime: zod.enum(MealTime).optional(),
		orderWindowStart: zod.string().regex(/^\d{2}:\d{2}$/).optional(),
		orderWindowEnd: zod.string().regex(/^\d{2}:\d{2}$/).optional(),
		deliveryWindowStart: zod.string().regex(/^\d{2}:\d{2}$/).optional(),
		deliveryWindowEnd: zod.string().regex(/^\d{2}:\d{2}$/).optional(),
		capacity: zod.number().int().min(1).optional(),
		active: zod.boolean().optional(),
	})
	.strict()
	.superRefine((val, ctx) => {
		if (
			val.orderWindowEnd &&
			val.orderWindowStart &&
			val.orderWindowEnd === val.orderWindowStart
		) {
			ctx.addIssue({
				code: zod.ZodIssueCode.custom,
				message: "Order window end must be after start.",
				path: ["orderWindowEnd"],
			});
		}
		if (
			val.deliveryWindowEnd &&
			val.deliveryWindowStart &&
			val.deliveryWindowEnd === val.deliveryWindowStart
		) {
			ctx.addIssue({
				code: zod.ZodIssueCode.custom,
				message: "Delivery window end must be after start.",
				path: ["deliveryWindowEnd"],
			});
		}
		if (
			val.orderWindowEnd &&
			val.deliveryWindowStart &&
			val.orderWindowEnd > val.deliveryWindowStart
		) {
			ctx.addIssue({
				code: zod.ZodIssueCode.custom,
				message: "Order window end must be at or before delivery window start.",
				path: ["orderWindowEnd"],
			});
		}
	})
	.transform((val) => ({
		...val,
		...(val.name ? { name: val.name } : {}),
	}));
