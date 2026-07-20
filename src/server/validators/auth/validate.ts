import { z as zod } from "zod";

const email = zod.string().trim().toLowerCase().email().max(254);
const nextPath = zod
	.string()
	.trim()
	.max(500)
	.optional()
	.refine(
		(value) => !value || (value.startsWith("/") && !value.startsWith("//")),
		{
			message: "Invalid return path.",
		},
	);

export const emailSignInRequestBodySchema = zod
	.object({
		email,
		next: nextPath,
	})
	.strict();

export const emailSignInVerifyQuerySchema = zod
	.object({
		token: zod.string().min(20).max(300),
		next: nextPath,
	})
	.strict();

export const googleStartQuerySchema = zod
	.object({
		next: nextPath,
	})
	.strict();

export const googleCallbackQuerySchema = zod
	.object({
		code: zod.string().min(1).optional(),
		state: zod.string().min(20).max(500).optional(),
		error: zod.string().optional(),
	})
	.strict();
