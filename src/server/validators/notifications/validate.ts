import { z as zod } from "zod";
import { ErrInvalidFields } from "@/server/constants";

export const listNotificationsQuerySchema = zod
	.object({
		unread: zod
			.enum(["true", "false"])
			.transform((v) => v === "true")
			.optional(),
		limit: zod.coerce.number().int().min(1).max(100).optional(),
		offset: zod.coerce.number().int().min(0).optional(),
	})
	.strict();

export type ListNotificationsQuery = zod.infer<
	typeof listNotificationsQuerySchema
>;

export function parseListNotificationsQuery(
	input: unknown,
): ListNotificationsQuery {
	const result = listNotificationsQuerySchema.safeParse(input);
	if (!result.success) throw ErrInvalidFields;
	return result.data;
}
