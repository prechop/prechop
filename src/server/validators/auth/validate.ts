import { z as zod } from "zod";
import {
	NIGERIAN_PHONE_ERROR_MESSAGE,
	normalizeNigerianMobilePhone,
} from "@/server/constants";

// Accept supported Nigerian mobile forms and normalize to +234XXXXXXXXXX.
const phone = zod
	.string()
	.trim()
	.transform((value, ctx) => {
		const normalized = normalizeNigerianMobilePhone(value);
		if (!normalized) {
			ctx.addIssue({
				code: "custom",
				message: NIGERIAN_PHONE_ERROR_MESSAGE,
			});
			return zod.NEVER;
		}
		return normalized;
	});

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
		campusId: zod.string().min(1).optional(),
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
