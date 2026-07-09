import { z as zod } from "zod";
import { MenuCategory } from "@/server/models";

export const createMenuItemSchema = zod
	.object({
		name: zod.string().trim().min(1).max(160),
		category: zod.enum(MenuCategory),
		priceNaira: zod.number().positive(),
		description: zod.string().trim().max(2000).optional(),
		estimatedPrepMin: zod.number().int().positive().optional(),
		displayOrder: zod.number().int().min(0).optional(),
		optionGroupIds: zod.array(zod.string().trim().min(1)).optional(),
	})
	.strict();

export const updateMenuItemSchema = zod
	.object({
		name: zod.string().trim().min(1).max(160).optional(),
		category: zod.enum(MenuCategory).optional(),
		priceNaira: zod.number().positive().optional(),
		description: zod.string().trim().max(2000).optional(),
		estimatedPrepMin: zod.number().int().positive().optional(),
		displayOrder: zod.number().int().min(0).optional(),
		optionGroupIds: zod.array(zod.string().trim().min(1)).optional(),
	})
	.strict();

export const availabilitySchema = zod
	.object({
		isAvailable: zod.boolean(),
	})
	.strict();

export const soldOutSchema = zod
	.object({
		isSoldOut: zod.boolean(),
	})
	.strict();

export const reorderSchema = zod
	.object({
		items: zod
			.array(
				zod
					.object({
						id: zod.string().trim().min(1),
						displayOrder: zod.number().int().min(0),
					})
					.strict(),
			)
			.min(1),
	})
	.strict();

export const imagePresignSchema = zod
	.object({
		mimeType: zod.string().trim().min(1),
	})
	.strict();

export const imageConfirmSchema = zod
	.object({
		imageUrl: zod.string().trim().url(),
	})
	.strict();
