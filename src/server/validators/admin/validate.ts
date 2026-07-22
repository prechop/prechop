import { z as zod } from "zod";
import {
	ORDER_DISPUTE_ACTIONS,
	ORDER_DISPUTE_REASONS,
	ORDER_DISPUTE_STATUSES,
	OrderStatus,
	VendorStatus,
} from "@/server/models";

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

// Admin manual refund (PRD §8.14). `amountKobo` is optional and defaults to the
// full order total in the service; when supplied it must be a positive whole
// number of kobo — a float or a negative would otherwise reach Paystack as a
// nonsense payout. `.strict()` keeps an unexpected field from being ignored
// silently on a money path.
export const adminRefundOrderSchema = zod
	.object({
		reason: zod.string().trim().min(1).max(500),
		amountKobo: zod.number().int().positive().optional(),
	})
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

export const disputesQuerySchema = zod
	.object({
		status: zod.enum(ORDER_DISPUTE_STATUSES).optional(),
		limit: zod.coerce.number().int().min(1).max(100).optional(),
		offset: zod.coerce.number().int().min(0).optional(),
	})
	.strict();

export const openOrderDisputeSchema = zod
	.object({
		reason: zod.enum(ORDER_DISPUTE_REASONS),
		buyerNotes: zod.array(zod.string().trim().min(1).max(1000)).optional(),
		vendorNotes: zod.array(zod.string().trim().min(1).max(1000)).optional(),
		photos: zod.array(zod.string().trim().url()).optional(),
		messages: zod.array(zod.unknown()).optional(),
	})
	.strict();

export const reviewOrderDisputeSchema = zod
	.object({
		action: zod.enum(ORDER_DISPUTE_ACTIONS),
		note: zod.string().trim().min(1).max(2000).optional(),
		amountKobo: zod.number().int().positive().optional(),
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

/**
 * A fee percentage from an admin form. `zod.number()` already rejects the two
 * traps that make a fee silently vanish — a bare `zod.coerce.number()` would
 * turn `""` into `0` (a cleared input zeroing a live fee) and `"8%"` into `NaN`
 * — because it accepts neither strings nor NaN. `.min(0)` blocks a negative fee
 * (which would pay the buyer), `.max(100)` blocks charging more than the whole
 * subtotal, and `.finite()` blocks Infinity. An explicit `0` is allowed: that is
 * a deliberate zero-fee promo, and it is distinguishable from "unset" because
 * the field is optional and `.strict()` rejects anything unrecognised.
 */
const feePercentSchema = zod.number().finite().min(0).max(100);

export const updateSiteConfigsSchema = zod
	.object({
		platformFeeBuyerPercent: feePercentSchema.optional(),
		platformFeeVendorPercent: feePercentSchema.optional(),
		// The cap is a whole number of kobo — a fractional kobo is not payable.
		platformFeeBuyerMaxKobo: zod
			.number()
			.int()
			.min(0)
			.max(100_000_000)
			.optional(),
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
