// Sentinel Error singletons. Services throw these by identity; `getErrorResponse`
// maps each to an HTTP status. This mirrors the managerenta pattern. For errors
// that need a runtime-interpolated message (e.g. "Jollof Rice is sold out"),
// throw an `AppError` instead (defined below) — it carries its own status.

// ── 400 ──────────────────────────────────────────────────────────────────
export const ErrInvalidFields: Error = new Error("Invalid fields");
export const ErrInvalidAction: Error = new Error("Invalid action");
export const ErrValidation: Error = new Error("Validation failed");
export const ErrOtpInvalid: Error = new Error("Invalid or expired OTP.");
export const ErrPaymentVerification: Error = new Error(
	"Payment verification failed.",
);
export const ErrPaymentAmountMismatch: Error = new Error(
	"Payment amount does not match order total.",
);

// ── 401 ──────────────────────────────────────────────────────────────────
export const ErrUnauthorized: Error = new Error("Unauthorized");
export const ErrInvalidCredentials: Error = new Error("Invalid credentials");
export const ErrTokenCompromised: Error = new Error(
	"Session security issue detected. Please log in again.",
);
export const ErrInvalidWebhookSignature: Error = new Error(
	"Invalid webhook signature.",
);

// ── 403 ──────────────────────────────────────────────────────────────────
export const ErrForbidden: Error = new Error(
	"You do not have permission to access this resource.",
);
export const ErrVendorNotActive: Error = new Error(
	"This vendor is not currently active.",
);
export const ErrProfileIncomplete: Error = new Error(
	"Complete your profile before performing this action.",
);
export const ErrCampusMismatch: Error = new Error(
	"This resource belongs to a different campus.",
);
export const ErrBuiltInImmutable: Error = new Error(
	"Built-in groups and policies cannot be modified or deleted.",
);
export const ErrSelfLockout: Error = new Error(
	"You cannot remove your own administrative access.",
);
export const ErrCannotOrderOwnListing: Error = new Error(
	"You cannot place an order from your own listing.",
);

// ── 404 ──────────────────────────────────────────────────────────────────
export const ErrResourceNotFound: Error = new Error("Resource not found");
export const ErrUserNotFound: Error = new Error("User not found");
export const ErrVendorNotFound: Error = new Error("Vendor not found");
export const ErrDailyOrderNotFound: Error = new Error(
	"This order is no longer available.",
);
export const ErrOrderNotFound: Error = new Error("Order not found.");
export const ErrMenuItemNotFound: Error = new Error("Menu item not found.");
export const ErrPolicyNotFound: Error = new Error("Policy not found.");
export const ErrGroupNotFound: Error = new Error("Group not found.");

// ── 409 ──────────────────────────────────────────────────────────────────
export const ErrResourceAlreadyExist: Error = new Error(
	"Resource already exists",
);
export const ErrDailyOrderNotActive: Error = new Error(
	"This order is not currently accepting purchases.",
);
export const ErrCutoffPassed: Error = new Error(
	"Ordering has closed for this listing.",
);
export const ErrSlotUnavailable: Error = new Error("This item is sold out.");
export const ErrOrderNotCancellable: Error = new Error(
	"This order can no longer be cancelled.",
);
export const ErrReviewAlreadyExists: Error = new Error(
	"You have already reviewed this order.",
);
export const ErrReviewWindowExpired: Error = new Error(
	"The review window for this order has expired.",
);

// ── 429 ──────────────────────────────────────────────────────────────────
export const ErrTooManyRequests: Error = new Error(
	"Too many requests, please try again later.",
);
export const ErrOtpRateLimited: Error = new Error(
	"Too many OTP attempts. Try again in 30 minutes.",
);

// ── 500 ──────────────────────────────────────────────────────────────────
export const ErrInternalServerError: Error = new Error("Internal server error");
export const ErrTryAgain: Error = new Error("Please try again");

/**
 * Error subclass carrying an explicit HTTP status and a machine code. Use for
 * domain errors whose message depends on runtime data, or which need a stable
 * client-facing `code` (e.g. `CUTOFF_PASSED`) the frontend switches on.
 */
export class AppError extends Error {
	readonly statusCode: number;
	readonly appCode: string;

	constructor(message: string, statusCode = 400, appCode = "APP_ERROR") {
		super(message);
		this.name = "AppError";
		this.statusCode = statusCode;
		this.appCode = appCode;
	}
}

export function slotUnavailable(itemName?: string): AppError {
	return new AppError(
		itemName ? `${itemName} is sold out.` : "This item is sold out.",
		409,
		"SLOT_UNAVAILABLE",
	);
}

export function invalidOrderState(message: string): AppError {
	return new AppError(message, 409, "INVALID_ORDER_STATE");
}

export function validationError(message: string): AppError {
	return new AppError(message, 400, "VALIDATION_ERROR");
}

export function notFound(resource: string): AppError {
	return new AppError(`${resource} not found.`, 404, "NOT_FOUND");
}

export function conflict(message: string): AppError {
	return new AppError(message, 409, "CONFLICT");
}

export function serviceUnavailable(
	message: string,
	appCode = "SERVICE_UNAVAILABLE",
): AppError {
	return new AppError(message, 503, appCode);
}
