import { z as zod } from "zod";
import { ErrInvalidFields } from "@/server/constants";

export const subscribePushSchema = zod
	.object({
		endpoint: zod.string().trim().url(),
		keys: zod
			.object({
				p256dh: zod.string().trim().min(1),
				auth: zod.string().trim().min(1),
			})
			.strict(),
		userAgent: zod.string().trim().max(512).optional(),
	})
	.strict();

export type SubscribePushInput = zod.infer<typeof subscribePushSchema>;

export function parseSubscribePush(input: unknown): SubscribePushInput {
	const result = subscribePushSchema.safeParse(input);
	if (!result.success) throw ErrInvalidFields;
	return result.data;
}
