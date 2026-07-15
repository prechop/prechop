import { z as zod } from "zod";
import { OrderStatus, VendorStatus } from "@/server/models";

export const createCampusSchema = zod
	.object({
		name: zod.string().trim().min(1).max(200),
		shortCode: zod.string().trim().min(1).max(20),
		state: zod.string().trim().min(1).max(120),
	})
	.strict();

export const updateCampusSchema = zod
	.object({
		name: zod.string().trim().min(1).max(200).optional(),
		shortCode: zod.string().trim().min(1).max(20).optional(),
		state: zod.string().trim().min(1).max(120).optional(),
		isActive: zod.boolean().optional(),
	})
	.strict();

export const createSchoolSchema = zod
	.object({
		name: zod.string().trim().min(1).max(200),
		state: zod.string().trim().min(1).max(120),
		type: zod.enum(["University", "Polytechnic", "College of Education"]),
	})
	.strict();

export const vendorsQuerySchema = zod
	.object({
		campusId: zod.string().trim().min(1).optional(),
		status: zod.enum(VendorStatus).optional(),
	})
	.strict();

export const suspendVendorSchema = zod
	.object({ reason: zod.string().trim().min(1).max(500) })
	.strict();

export const onboardingQueueQuerySchema = zod
	.object({ campusId: zod.string().trim().min(1).optional() })
	.strict();

export const approveVendorSchema = zod
	.object({ notes: zod.string().trim().max(1000).optional() })
	.strict();

export const rejectVendorSchema = zod
	.object({ reason: zod.string().trim().min(1).max(1000) })
	.strict();

export const ordersQuerySchema = zod
	.object({
		status: zod.enum(OrderStatus).optional(),
		limit: zod.coerce.number().int().min(1).max(50).optional(),
		offset: zod.coerce.number().int().min(0).optional(),
	})
	.strict();

export const whatsappTvsQuerySchema = zod
	.object({ campusId: zod.string().trim().min(1) })
	.strict();

export const createWhatsappTvSchema = zod
	.object({
		campusId: zod.string().trim().min(1),
		name: zod.string().trim().min(1).max(200),
		whatsappNumber: zod.string().trim().min(1),
		audienceSize: zod.coerce.number().int().min(0).optional(),
		priceRange: zod.string().trim().min(1).max(120).optional(),
		displayOrder: zod.coerce.number().int().min(0).optional(),
	})
	.strict();

export const updateWhatsappTvSchema = zod
	.object({
		name: zod.string().trim().min(1).max(200).optional(),
		whatsappNumber: zod.string().trim().min(1).optional(),
		audienceSize: zod.coerce.number().int().min(0).optional(),
		priceRange: zod.string().trim().min(1).max(120).optional(),
		displayOrder: zod.coerce.number().int().min(0).optional(),
	})
	.strict();

export const updateSiteConfigsSchema = zod
	.object({
		platformFeeBuyerKobo: zod.number().int().min(0).optional(),
		platformFeeVendorKobo: zod.number().int().min(0).optional(),
		slotHoldTtlSeconds: zod.number().int().min(0).optional(),
		abandonedOrderMinutes: zod.number().int().min(0).optional(),
		externalPaymentLinkTtlMinutes: zod.number().int().min(1).optional(),
		reviewWindowHours: zod.number().int().min(0).optional(),
		cutoffWarningMinutes: zod.number().int().min(0).optional(),
		whatsappTvEnabled: zod.boolean().optional(),
		marketplaceEnabled: zod.boolean().optional(),
		reviewsEnabled: zod.boolean().optional(),
		ordersKillSwitch: zod.boolean().optional(),
		paymentsKillSwitch: zod.boolean().optional(),
		profileCompletenessRequired: zod
			.number()
			.int()
			.min(0)
			.max(100)
			.optional(),
	})
	.strict();

export const auditQuerySchema = zod
	.object({
		limit: zod.coerce.number().int().min(1).max(100).optional(),
		offset: zod.coerce.number().int().min(0).optional(),
	})
	.strict();

export const catalogQuerySchema = zod
	.object({
		campusId: zod.string().trim().min(1).optional(),
		search: zod.string().trim().max(120).optional(),
		page: zod.coerce.number().int().min(1).optional(),
		pageSize: zod.coerce.number().int().min(1).max(100).optional(),
	})
	.strict();

export const catalogAvailabilitySchema = zod
	.object({ isAvailable: zod.boolean() })
	.strict();

export const paymentsQuerySchema = zod
	.object({
		status: zod
			.enum(["INITIALIZED", "SUCCESS", "FAILED", "ABANDONED", "REFUNDED"])
			.optional(),
		page: zod.coerce.number().int().min(1).optional(),
		pageSize: zod.coerce.number().int().min(1).max(100).optional(),
	})
	.strict();

export const broadcastNotificationSchema = zod
	.object({
		title: zod.string().trim().min(1).max(120),
		body: zod.string().trim().min(1).max(500),
		campusId: zod.string().trim().min(1).optional(),
	})
	.strict();
