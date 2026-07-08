import { z as zod } from "zod";
import { ErrInvalidFields } from "@/server/constants";

export const updateProfileSchema = zod
	.object({
		firstName: zod.string().trim().min(1).max(80).optional(),
		lastName: zod.string().trim().min(1).max(80).optional(),
	})
	.strict();

export type UpdateProfileInput = zod.infer<typeof updateProfileSchema>;

export function parseUpdateProfile(input: unknown): UpdateProfileInput {
	const result = updateProfileSchema.safeParse(input);
	if (!result.success) throw ErrInvalidFields;
	return result.data;
}

export const updateCampusSchema = zod
	.object({
		campusId: zod.string().trim().min(1),
	})
	.strict();

export type UpdateCampusInput = zod.infer<typeof updateCampusSchema>;

export function parseUpdateCampus(input: unknown): UpdateCampusInput {
	const result = updateCampusSchema.safeParse(input);
	if (!result.success) throw ErrInvalidFields;
	return result.data;
}
