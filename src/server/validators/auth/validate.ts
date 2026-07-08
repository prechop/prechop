import { z as zod } from "zod";

// Nigerian phone: local 11-digit (0XXXXXXXXXX) or intl (234XXXXXXXXXX).
const phone = zod
	.string()
	.trim()
	.regex(/^(0\d{10}|234\d{10})$/, "Enter a valid Nigerian phone number");

export const registerBuyerBodySchema = zod
	.object({
		firstName: zod.string().min(1).max(60),
		lastName: zod.string().min(1).max(60),
		phone,
		campusId: zod.string().min(1),
	})
	.strict();

export const registerVendorBodySchema = zod
	.object({
		firstName: zod.string().min(1).max(60),
		lastName: zod.string().min(1).max(60),
		phone,
		campusId: zod.string().min(1),
		email: zod.string().email(),
		businessName: zod.string().min(1).max(120).optional(),
	})
	.strict();

export const requestOtpBodySchema = zod.object({ phone }).strict();

export const verifyOtpBodySchema = zod
	.object({
		phone,
		otp: zod.string().regex(/^\d{6}$/, "OTP must be 6 digits"),
	})
	.strict();
