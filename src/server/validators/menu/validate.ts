import { z as zod } from "zod";
import { validationError } from "@/server/constants";
import { MenuCategory } from "@/server/models";

const SUPPORTED_IMAGE_MIME_TYPES = [
	"image/jpeg",
	"image/png",
	"image/webp",
] as const;

export const createMenuItemSchema = zod
	.object({
		name: zod
			.string()
			.trim()
			.min(1, "Menu name is required.")
			.max(160, "Menu name must be 160 characters or fewer."),
		category: zod.enum(MenuCategory, {
			message: "Menu category is invalid.",
		}),
		priceNaira: zod
			.number({ message: "Price is required." })
			.positive("Price must be greater than zero."),
		description: zod
			.string()
			.trim()
			.max(2000, "Description must be 2000 characters or fewer.")
			.optional(),
		imageUrl: zod
			.string()
			.trim()
			.url("The uploaded image URL is invalid.")
			.optional(),
		estimatedPrepMin: zod
			.number({ message: "Prep time must be a whole number." })
			.int("Prep time must be a whole number.")
			.positive("Prep time must be greater than zero.")
			.optional(),
		displayOrder: zod
			.number({ message: "Display order must be a whole number." })
			.int("Display order must be a whole number.")
			.min(0, "Display order must be zero or greater.")
			.optional(),
		optionGroupIds: zod.array(zod.string().trim().min(1)).optional(),
	})
	.strict();

export const updateMenuItemSchema = zod
	.object({
		name: zod
			.string()
			.trim()
			.min(1, "Menu name is required.")
			.max(160, "Menu name must be 160 characters or fewer.")
			.optional(),
		category: zod
			.enum(MenuCategory, { message: "Menu category is invalid." })
			.optional(),
		priceNaira: zod
			.number({ message: "Price is required." })
			.positive("Price must be greater than zero.")
			.optional(),
		description: zod
			.string()
			.trim()
			.max(2000, "Description must be 2000 characters or fewer.")
			.optional(),
		imageUrl: zod
			.string()
			.trim()
			.url("The uploaded image URL is invalid.")
			.optional(),
		estimatedPrepMin: zod
			.number({ message: "Prep time must be a whole number." })
			.int("Prep time must be a whole number.")
			.positive("Prep time must be greater than zero.")
			.optional(),
		displayOrder: zod
			.number({ message: "Display order must be a whole number." })
			.int("Display order must be a whole number.")
			.min(0, "Display order must be zero or greater.")
			.optional(),
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
		mimeType: zod.enum(SUPPORTED_IMAGE_MIME_TYPES, {
			message: "The uploaded image format is not supported.",
		}),
	})
	.strict();

export const imageConfirmSchema = zod
	.object({
		imageUrl: zod.string().trim().url().optional(),
		key: zod.string().trim().min(1).optional(),
	})
	.refine((v) => !!v.imageUrl || !!v.key, {
		message: "Image upload confirmation is missing the uploaded image.",
	})
	.strict();

export function menuValidationError(error: zod.ZodError) {
	const issue = error.issues[0];
	if (!issue) return validationError("Invalid menu details.");
	if (issue.code === "unrecognized_keys") {
		const keys = (issue as unknown as { keys?: string[] }).keys ?? [];
		return validationError(
			keys.length
				? `Unknown menu field: ${keys.join(", ")}.`
				: "Unknown menu field.",
		);
	}

	const messageByField: Record<string, string> = {
		name: "Menu name is required.",
		category: "Menu category is invalid.",
		priceNaira: "Price must be greater than zero.",
		description: "Description must be 2000 characters or fewer.",
		imageUrl: "The uploaded image URL is invalid.",
		estimatedPrepMin: "Prep time must be greater than zero.",
		displayOrder: "Display order must be zero or greater.",
		optionGroupIds: "One or more option groups is invalid.",
		mimeType: "The uploaded image format is not supported.",
	};
	const field = String(issue.path[0] ?? "");
	return validationError(
		issue.message || messageByField[field] || "Invalid menu details.",
	);
}
