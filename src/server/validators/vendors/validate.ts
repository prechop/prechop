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
		imageUrl: zod.string().trim().url(),
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
	})
	.strict();
