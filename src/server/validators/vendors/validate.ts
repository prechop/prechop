import { z as zod } from "zod";
import { LocationType, MenuCategory, VendorType } from "@/server/models";

export const businessIdentitySchema = zod
	.object({
		businessName: zod.string().trim().min(1).max(120),
		vendorType: zod.enum(VendorType).optional(),
		description: zod.string().trim().max(2000).optional(),
		email: zod.string().trim().email(),
	})
	.strict();

export const locationSchema = zod.discriminatedUnion("locationType", [
	zod
		.object({
			locationType: zod.literal(LocationType.ON_CAMPUS),
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

export const bankDetailsSchema = zod
	.object({
		bankCode: zod.string().trim().min(1),
		accountNumber: zod.string().trim().min(1),
		bankName: zod.string().trim().min(1).optional(),
	})
	.strict();

export const openStatusSchema = zod
	.object({
		isOpenForOrders: zod.boolean(),
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
		location: locationSchema,
	})
	.strict();

export type BecomeVendorInput = zod.infer<typeof becomeVendorSchema>;

export const earningsQuerySchema = zod
	.object({
		// Defaulted rather than required so `?` with no query string is a valid
		// request for today, and an unknown range is rejected outright instead
		// of silently falling back to "all" (which would leak a wider window
		// than the caller asked for).
		range: zod.enum(["today", "week", "month", "all"]).default("today"),
	})
	.strict();

export type EarningsQueryInput = zod.infer<typeof earningsQuerySchema>;
