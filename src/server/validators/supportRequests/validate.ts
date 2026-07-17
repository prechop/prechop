import { z as zod } from "zod";

export const supportCategorySchema = zod.enum([
	"ORDER",
	"PAYMENT",
	"REFUND",
	"VENDOR_ACCOUNT",
	"MENU",
	"SETTLEMENT",
	"TECHNICAL",
	"OTHER",
]);

export const supportStatusSchema = zod.enum([
	"OPEN",
	"PENDING_USER",
	"RESOLVED",
	"CLOSED",
]);

export const createSupportRequestSchema = zod.object({
	category: supportCategorySchema,
	subject: zod.string().trim().min(3).max(140),
	message: zod.string().trim().min(10).max(2000),
	relatedOrderRef: zod.string().trim().max(80).optional(),
	relatedPaymentRef: zod.string().trim().max(120).optional(),
});

export const addSupportMessageSchema = zod.object({
	message: zod.string().trim().min(2).max(2000),
});

export const updateSupportRequestSchema = zod.object({
	status: supportStatusSchema.optional(),
	assignedAdminId: zod.string().trim().min(1).optional(),
});
