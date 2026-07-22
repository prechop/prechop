// Domain enums. Stored as string unions in Mongoose (`enum`), same values as
// the former Prisma enums so historical data and API contracts are unchanged.

export enum UserRole {
	BUYER = "BUYER",
	VENDOR = "VENDOR",
	SUPER_ADMIN = "SUPER_ADMIN",
}

export enum VendorType {
	STUDENT_COOK = "STUDENT_COOK",
	CAMPUS_STALL = "CAMPUS_STALL",
	RESTAURANT = "RESTAURANT",
	BAKERY = "BAKERY",
}

export enum VendorStatus {
	/** Vendor is still filling in their onboarding details. */
	INCOMPLETE = "INCOMPLETE",
	/** Submitted; awaiting admin review. Locked read-only. */
	PENDING_REVIEW = "PENDING_REVIEW",
	/** Admin rejected the submission with feedback; vendor edits & resubmits. */
	CHANGES_REQUESTED = "CHANGES_REQUESTED",
	/** Approved and live. */
	ACTIVE = "ACTIVE",
	SUSPENDED = "SUSPENDED",
}

export enum LocationType {
	ON_CAMPUS = "ON_CAMPUS",
	OFF_CAMPUS = "OFF_CAMPUS",
}

export enum MenuCategory {
	MEALS = "MEALS",
	FAST_FOOD_GRILLS = "FAST_FOOD_GRILLS",
	SNACKS_PASTRIES = "SNACKS_PASTRIES",
	CAKES_DESSERTS = "CAKES_DESSERTS",
	DRINKS = "DRINKS",
}

export enum DailyOrderStatus {
	DRAFT = "DRAFT",
	ACTIVE = "ACTIVE",
	CLOSED = "CLOSED",
	CANCELLED = "CANCELLED",
}

export enum OrderStatus {
	PENDING_PAYMENT = "PENDING_PAYMENT",
	AWAITING_EXTERNAL_PAYMENT = "AWAITING_EXTERNAL_PAYMENT",
	PAID = "PAID",
	AWAITING_VENDOR_ACCEPTANCE = "AWAITING_VENDOR_ACCEPTANCE",
	ACCEPTED = "ACCEPTED",
	CONFIRMED = "CONFIRMED",
	COOKING = "COOKING",
	PREPARING = "PREPARING",
	READY = "READY",
	IN_TRANSIT = "IN_TRANSIT",
	AWAITING_BUYER_NO_SHOW_RESPONSE = "AWAITING_BUYER_NO_SHOW_RESPONSE",
	COMPLETED_BUYER_NO_SHOW = "COMPLETED_BUYER_NO_SHOW",
	PICKUP_PROBLEM_REPORTED = "PICKUP_PROBLEM_REPORTED",
	BUYER_UNREACHABLE_REPORTED = "BUYER_UNREACHABLE_REPORTED",
	DELIVERY_FAILED = "DELIVERY_FAILED",
	PICKED_UP = "PICKED_UP",
	DELIVERED = "DELIVERED",
	COMPLETED = "COMPLETED",
	VENDOR_REJECTED = "VENDOR_REJECTED",
	EXPIRED_VENDOR_NO_RESPONSE = "EXPIRED_VENDOR_NO_RESPONSE",
	REFUND_PENDING = "REFUND_PENDING",
	REFUND_PROCESSING = "REFUND_PROCESSING",
	REFUND_FAILED = "REFUND_FAILED",
	CANCELLED = "CANCELLED",
	REFUNDED = "REFUNDED",
}

export enum FulfillmentType {
	PICKUP = "PICKUP",
	DELIVERY = "DELIVERY",
}

export enum PaymentStatus {
	INITIALIZED = "INITIALIZED",
	AWAITING_EXTERNAL_PAYMENT = "AWAITING_EXTERNAL_PAYMENT",
	SUCCESS = "SUCCESS",
	FAILED = "FAILED",
	ABANDONED = "ABANDONED",
	EXPIRED = "EXPIRED",
	CANCELLED = "CANCELLED",
	REFUNDED = "REFUNDED",
}

export enum DayOfWeek {
	MONDAY = "MONDAY",
	TUESDAY = "TUESDAY",
	WEDNESDAY = "WEDNESDAY",
	THURSDAY = "THURSDAY",
	FRIDAY = "FRIDAY",
	SATURDAY = "SATURDAY",
	SUNDAY = "SUNDAY",
}

export const ALL_MENU_CATEGORIES = Object.values(MenuCategory);
export const ALL_DAYS_OF_WEEK = Object.values(DayOfWeek);

/**
 * Statuses that mean "money changed hands and this is a real order": the buyer
 * paid and the order was not cancelled or refunded. This is the single
 * definition of a countable order — `totalRevenueKobo`, `topItemIds`,
 * `peakHour` and the completion-rate denominator all use exactly this set, so
 * a vendor's revenue and their completion rate can never disagree about which
 * orders exist. Deliberately excludes PENDING_PAYMENT (an unpaid cart is not
 * an order and must not count against a vendor) and CANCELLED/REFUNDED.
 */
export const SETTLED_ORDER_STATUSES: OrderStatus[] = [
	OrderStatus.PAID,
	OrderStatus.AWAITING_VENDOR_ACCEPTANCE,
	OrderStatus.ACCEPTED,
	OrderStatus.CONFIRMED,
	OrderStatus.COOKING,
	OrderStatus.PREPARING,
	OrderStatus.READY,
	OrderStatus.IN_TRANSIT,
	OrderStatus.AWAITING_BUYER_NO_SHOW_RESPONSE,
	OrderStatus.COMPLETED_BUYER_NO_SHOW,
	OrderStatus.PICKUP_PROBLEM_REPORTED,
	OrderStatus.BUYER_UNREACHABLE_REPORTED,
	OrderStatus.DELIVERY_FAILED,
	OrderStatus.PICKED_UP,
	OrderStatus.DELIVERED,
	OrderStatus.COMPLETED,
];
