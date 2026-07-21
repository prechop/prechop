import { describe, expect, it } from "vitest";
import {
	AppError,
	conflict,
	ErrCutoffPassed,
	ErrForbidden,
	ErrInternalServerError,
	ErrInvalidCredentials,
	ErrInvalidFields,
	ErrResourceAlreadyExist,
	ErrTooManyRequests,
	ErrUserNotFound,
	getErrorResponse,
	invalidOrderState,
	notFound,
	slotUnavailable,
	validationError,
} from "@/server/constants/errors";

describe("getErrorResponse", () => {
	it("maps AppError to its own status + appCode", () => {
		const res = getErrorResponse(new AppError("boom", 418, "TEAPOT"));
		expect(res.code).toBe(418);
		expect(res.message).toBe("boom");
		expect(res.appCode).toBe("TEAPOT");
	});

	it("maps 400-class sentinels", () => {
		expect(getErrorResponse(ErrInvalidFields).code).toBe(400);
	});

	it("maps 401-class sentinels", () => {
		expect(getErrorResponse(ErrInvalidCredentials).code).toBe(401);
	});

	it("maps 403-class sentinels", () => {
		expect(getErrorResponse(ErrForbidden).code).toBe(403);
	});

	it("maps 404-class sentinels", () => {
		expect(getErrorResponse(ErrUserNotFound).code).toBe(404);
	});

	it("maps 409-class sentinels", () => {
		expect(getErrorResponse(ErrResourceAlreadyExist).code).toBe(409);
		expect(getErrorResponse(ErrCutoffPassed).code).toBe(409);
	});

	it("maps 429-class sentinels", () => {
		expect(getErrorResponse(ErrTooManyRequests).code).toBe(429);
	});

	it("maps 500-class sentinels", () => {
		expect(getErrorResponse(ErrInternalServerError).code).toBe(500);
	});

	it("collapses an unknown error to a generic 500", () => {
		const res = getErrorResponse(new Error("some internal detail"));
		expect(res.code).toBe(500);
		expect(res.message).toBe("Internal server error");
		expect(res.message).not.toContain("some internal detail");
	});

	it("strips the 'Error: ' prefix from sentinel messages", () => {
		const res = getErrorResponse(ErrInvalidFields);
		expect(res.message).toBe("Invalid fields");
	});
});

describe("AppError factories", () => {
	it("slotUnavailable includes item name and 409/SLOT_UNAVAILABLE", () => {
		const e = slotUnavailable("Jollof Rice");
		expect(e).toBeInstanceOf(AppError);
		expect(e.message).toBe("Jollof Rice is sold out.");
		expect(e.statusCode).toBe(409);
		expect(e.appCode).toBe("SLOT_UNAVAILABLE");
	});

	it("slotUnavailable falls back to generic message", () => {
		expect(slotUnavailable().message).toBe("This item is sold out.");
	});

	it("invalidOrderState/validationError/notFound/conflict carry the right status", () => {
		expect(invalidOrderState("x").statusCode).toBe(409);
		expect(validationError("x").statusCode).toBe(400);
		expect(notFound("Order").message).toBe("Order not found.");
		expect(notFound("Order").statusCode).toBe(404);
		expect(conflict("x").statusCode).toBe(409);
	});

	it("getErrorResponse handles factory-built AppErrors end to end", () => {
		const res = getErrorResponse(validationError("bad input"));
		expect(res.code).toBe(400);
		expect(res.appCode).toBe("VALIDATION_ERROR");
	});
});
