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
	INCOMPLETE = "INCOMPLETE",
	ACTIVE = "ACTIVE",
	SUSPENDED = "SUSPENDED",
}

export enum LocationType {
	ON_CAMPUS = "ON_CAMPUS",
	OFF_CAMPUS = "OFF_CAMPUS",
}

export enum MenuCategory {
	MEALS = "MEALS",
	SNACKS = "SNACKS",
	DRINKS = "DRINKS",
	BAKED_GOODS = "BAKED_GOODS",
}

export enum DailyOrderStatus {
	DRAFT = "DRAFT",
	ACTIVE = "ACTIVE",
	CLOSED = "CLOSED",
	CANCELLED = "CANCELLED",
}

export enum OrderStatus {
	PENDING_PAYMENT = "PENDING_PAYMENT",
	PAID = "PAID",
	CONFIRMED = "CONFIRMED",
	PREPARING = "PREPARING",
	READY = "READY",
	COMPLETED = "COMPLETED",
	CANCELLED = "CANCELLED",
	REFUNDED = "REFUNDED",
}

export enum FulfillmentType {
	PICKUP = "PICKUP",
	DELIVERY = "DELIVERY",
}

export enum PaymentStatus {
	INITIALIZED = "INITIALIZED",
	SUCCESS = "SUCCESS",
	FAILED = "FAILED",
	ABANDONED = "ABANDONED",
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
