import { z as zod } from "zod";
import {
	BakeryBusinessType,
	LocationType,
	MenuCategory,
	VendorType,
	VendorVerificationDocumentType,
} from "@/server/models";

export const businessIdentitySchema = zod
	.object({
		businessName: zod.string().trim().min(1).max(120),
		vendorType: zod.enum(VendorType).optional(),
		description: zod.string().trim().max(2000).optional(),
		email: zod.string().trim().email(),
		contactPhone: zod.string().trim().min(5).max(30).optional(),
	})
	.strict();

export const locationSchema = zod.discriminatedUnion("locationType", [
	zod
		.object({
			locationType: zod.literal(LocationType.ON_CAMPUS),
			campusId: zod.string().trim().min(1),
			schoolId: zod.string().trim().min(1).optional(),
			schoolNameOther: zod.string().trim().min(1).optional(),
			hostelOrStallName: zod.string().trim().min(1).max(200),
		})
		.strict(),
	zod
		.object({
			locationType: zod.literal(LocationType.OFF_CAMPUS),
			state: zod.string().trim().min(1).max(120),
			areaOrAddress: zod.string().trim().min(1).max(300),
			campusIds: zod.array(zod.string().trim().min(1)).min(1).max(3),
		})
		.strict(),
]);

export const setCategoriesSchema = zod
	.object({
		categories: zod.array(zod.enum(MenuCategory)).min(1),
	})
	.strict();

export const presignSchema = zod
	.object({
		mimeType: zod.string().trim().min(1),
	})
	.strict();

export const confirmImageSchema = zod
	.object({
		imageUrl: zod.string().trim().url().optional(),
		key: zod.string().trim().min(1).optional(),
	})
	.refine((v) => !!v.imageUrl || !!v.key, {
		message: "imageUrl or key is required",
	})
	.strict();

export const confirmVerificationDocumentSchema = zod
	.object({
		type: zod.enum(VendorVerificationDocumentType),
		key: zod.string().trim().min(1),
		fileName: zod.string().trim().min(1).max(240).optional(),
		mimeType: zod.string().trim().min(1).max(120).optional(),
		bakeryBusinessType: zod.enum(BakeryBusinessType).optional(),
	})
	.strict();

export const bankDetailsSchema = zod
	.object({
		bankCode: zod.string().trim().min(1),
		accountNumber: zod.string().trim().min(1),
		bankName: zod.string().trim().min(1).optional(),
		securityPin: zod
			.string()
			.trim()
			.regex(/^\d{4,6}$/),
	})
	.strict();

export const openStatusSchema = zod
	.object({
		isOpenForOrders: zod.boolean(),
	})
	.strict();

export const securityOnboardingSchema = zod.discriminatedUnion("action", [
	zod.object({ action: zod.literal("DISMISS") }).strict(),
	zod
		.object({
			action: zod.literal("COMPLETE"),
			pin: zod
				.string()
				.trim()
				.regex(/^\d{4,6}$/),
		})
		.strict(),
]);

export const securityPinVerificationSchema = zod
	.object({
		pin: zod
			.string()
			.trim()
			.regex(/^\d{4,6}$/),
	})
	.strict();

// Resolve-only bank lookup: previews the account name (Paystack) without
// creating a subaccount or persisting anything.
export const resolveBankSchema = zod
	.object({
		bankCode: zod.string().trim().min(1),
		accountNumber: zod.string().trim().min(1),
	})
	.strict();

export const notificationPrefsSchema = zod
	.object({
		notifyNewOrders: zod.boolean().optional(),
		notifyPayouts: zod.boolean().optional(),
		notifyReviews: zod.boolean().optional(),
	})
	.strict()
	.refine((v) => Object.keys(v).length > 0, {
		message: "At least one preference is required",
	});

export const deliveryDefaultsSchema = zod
	.object({
		defaultPickupAvailable: zod.boolean(),
		defaultDeliveryAvailable: zod.boolean(),
		defaultDeliveryFeeKobo: zod.number().int().min(0).max(10_000_00),
		defaultDeliveryCoverage: zod.string().trim().min(2).max(240).optional(),
		defaultDeliveryEstimateMinutes: zod
			.number()
			.int()
			.positive()
			.max(240)
			.optional(),
		defaultDeliveryContactPhone: zod
			.string()
			.trim()
			.min(5)
			.max(30)
			.optional(),
		defaultDeliveryResponsibilityAccepted: zod.boolean().optional(),
	})
	.strict()
	.superRefine((data, ctx) => {
		if (!data.defaultDeliveryAvailable) return;
		for (const key of [
			"defaultDeliveryCoverage",
			"defaultDeliveryEstimateMinutes",
			"defaultDeliveryContactPhone",
		] as const) {
			if (!data[key]) {
				ctx.addIssue({
					code: zod.ZodIssueCode.custom,
					path: [key],
					message: "Required when delivery is enabled.",
				});
			}
		}
		if (!data.defaultDeliveryResponsibilityAccepted) {
			ctx.addIssue({
				code: zod.ZodIssueCode.custom,
				path: ["defaultDeliveryResponsibilityAccepted"],
				message: "Vendor-managed delivery confirmation is required.",
			});
		}
	});

export const becomeVendorSchema = zod
	.object({
		businessName: zod.string().trim().min(1).max(120),
		vendorType: zod.enum(VendorType),
		email: zod.string().trim().email().optional(),
		contactPhone: zod.string().trim().min(5).max(30).optional(),
		location: locationSchema.optional(),
	})
	.strict();

export type BecomeVendorInput = zod.infer<typeof becomeVendorSchema>;

export const startVendorApplicationSchema = zod.object({}).strict();

export const earningsQuerySchema = zod
	.object({
		range: zod.enum(["today", "week", "month", "all"]).default("today"),
	})
	.strict();

export type EarningsQueryInput = zod.infer<typeof earningsQuerySchema>;

export const forgotPinRequestSchema = zod
	.object({
		email: zod.string().trim().email(),
	})
	.strict();

export const forgotPinVerifySchema = zod
	.object({
		email: zod.string().trim().email(),
		otp: zod
			.string()
			.trim()
			.regex(/^\d{6}$/, "Enter a valid 6-digit verification code"),
	})
	.strict();

export const forgotPinResetSchema = zod
	.object({
		resetToken: zod.string().trim().min(1),
		newPin: zod
			.string()
			.trim()
			.regex(/^\d{4,6}$/, "PIN must be 4-6 digits"),
	})
	.strict();

export const forgotPinSupportSchema = zod
	.object({
		reason: zod.string().trim().min(10).max(1000),
	})
	.strict();
