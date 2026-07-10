export * from "./errorMessages";

import {
	AppError,
	ErrBuiltInImmutable,
	ErrCampusMismatch,
	ErrCannotOrderOwnListing,
	ErrCutoffPassed,
	ErrDailyOrderNotActive,
	ErrDailyOrderNotFound,
	ErrForbidden,
	ErrGroupNotFound,
	ErrInternalServerError,
	ErrInvalidAction,
	ErrInvalidCredentials,
	ErrInvalidFields,
	ErrInvalidWebhookSignature,
	ErrMenuItemNotFound,
	ErrOrderNotCancellable,
	ErrOrderNotFound,
	ErrOtpInvalid,
	ErrOtpRateLimited,
	ErrPaymentAmountMismatch,
	ErrPaymentVerification,
	ErrPolicyNotFound,
	ErrProfileIncomplete,
	ErrResourceAlreadyExist,
	ErrResourceNotFound,
	ErrReviewAlreadyExists,
	ErrReviewWindowExpired,
	ErrSelfLockout,
	ErrSlotUnavailable,
	ErrTokenCompromised,
	ErrTooManyRequests,
	ErrTryAgain,
	ErrUnauthorized,
	ErrUserNotFound,
	ErrValidation,
	ErrVendorNotActive,
	ErrVendorNotFound,
} from "./errorMessages";

export interface IErrorResponse {
	code: number;
	message: string;
	appCode?: string;
	data: Error;
}

/**
 * Maps a thrown value to an HTTP status + client-facing message. `AppError`
 * instances carry their own status; sentinel Errors are matched by identity.
 * Anything unrecognized collapses to a generic 500 (message hidden in prod by
 * the response layer).
 */
export function getErrorResponse(error: Error): IErrorResponse {
	if (error instanceof AppError) {
		return {
			code: error.statusCode,
			message: error.message,
			appCode: error.appCode,
			data: error,
		};
	}

	const delimiter = "Error: ";
	let message: string = error?.toString()?.replace(delimiter, "");
	let code = 0;

	switch (error) {
		case ErrInvalidFields:
		case ErrInvalidAction:
		case ErrValidation:
		case ErrOtpInvalid:
		case ErrPaymentVerification:
		case ErrPaymentAmountMismatch:
			code = 400;
			break;

		case ErrUnauthorized:
		case ErrInvalidCredentials:
		case ErrTokenCompromised:
		case ErrInvalidWebhookSignature:
			code = 401;
			break;

		case ErrForbidden:
		case ErrVendorNotActive:
		case ErrProfileIncomplete:
		case ErrCampusMismatch:
		case ErrBuiltInImmutable:
		case ErrSelfLockout:
		case ErrCannotOrderOwnListing:
			code = 403;
			break;

		case ErrResourceNotFound:
		case ErrUserNotFound:
		case ErrVendorNotFound:
		case ErrDailyOrderNotFound:
		case ErrOrderNotFound:
		case ErrMenuItemNotFound:
		case ErrPolicyNotFound:
		case ErrGroupNotFound:
			code = 404;
			break;

		case ErrResourceAlreadyExist:
		case ErrDailyOrderNotActive:
		case ErrCutoffPassed:
		case ErrSlotUnavailable:
		case ErrOrderNotCancellable:
		case ErrReviewAlreadyExists:
		case ErrReviewWindowExpired:
			code = 409;
			break;

		case ErrTooManyRequests:
		case ErrOtpRateLimited:
			code = 429;
			break;

		case ErrInternalServerError:
		case ErrTryAgain:
			code = 500;
			break;

		default:
			code = 500;
			message = ErrInternalServerError.toString().replace(delimiter, "");
	}

	return { code, message, data: error };
}
