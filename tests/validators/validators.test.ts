import { describe, expect, it } from "vitest";
import { FulfillmentType, OrderStatus } from "@/server/models/enums";
import {
	registerBuyerBodySchema,
	registerVendorBodySchema,
	requestOtpBodySchema,
	verifyOtpBodySchema,
} from "@/server/validators/auth/validate";
import {
	cancelOrderBodySchema,
	placeOrderBodySchema,
	updateOrderStatusBodySchema,
} from "@/server/validators/buyerOrders/validate";
import {
	createDailyOrderSchema,
	marketplaceSearchSchema,
	myDailyOrdersQuerySchema,
} from "@/server/validators/dailyOrders/validate";
import { createMenuItemSchema } from "@/server/validators/menu/validate";
import { createReviewSchema } from "@/server/validators/reviews/validate";
import {
	parseUpdateProfile,
	updateProfileSchema,
} from "@/server/validators/users/validate";
import { locationSchema } from "@/server/validators/vendors/validate";

describe("auth phone regex", () => {
	const valid = ["08012345678", "07098765432", "2348012345678"];
	const invalid = [
		"0801234567", // 10 digits total (need 11)
		"080123456789", // 12 digits
		"234801234567", // 234 + only 9 digits
		"+2348012345678",
		"8012345678",
		"abcdefghijk",
	];

	it("accepts valid Nigerian numbers", () => {
		for (const p of valid) {
			expect(requestOtpBodySchema.safeParse({ phone: p }).success).toBe(
				true,
			);
		}
	});

	it("rejects malformed numbers", () => {
		for (const p of invalid) {
			expect(requestOtpBodySchema.safeParse({ phone: p }).success).toBe(
				false,
			);
		}
	});

	it("trims surrounding whitespace before validating", () => {
		expect(
			requestOtpBodySchema.safeParse({ phone: "  08012345678 " }).success,
		).toBe(true);
	});
});

describe("registerBuyerBodySchema", () => {
	it("accepts a complete body", () => {
		expect(
			registerBuyerBodySchema.safeParse({
				firstName: "Ada",
				lastName: "Obi",
				phone: "08012345678",
				campusId: "camp1",
			}).success,
		).toBe(true);
	});

	it("rejects extra keys (strict)", () => {
		expect(
			registerBuyerBodySchema.safeParse({
				firstName: "Ada",
				lastName: "Obi",
				phone: "08012345678",
				campusId: "camp1",
				extra: true,
			}).success,
		).toBe(false);
	});

	it("rejects empty names", () => {
		expect(
			registerBuyerBodySchema.safeParse({
				firstName: "",
				lastName: "Obi",
				phone: "08012345678",
				campusId: "camp1",
			}).success,
		).toBe(false);
	});
});

describe("registerVendorBodySchema", () => {
	it("requires a valid email", () => {
		const base = {
			firstName: "Ada",
			lastName: "Obi",
			phone: "08012345678",
			campusId: "camp1",
		};
		expect(
			registerVendorBodySchema.safeParse({
				...base,
				email: "vendor@example.com",
			}).success,
		).toBe(true);
		expect(
			registerVendorBodySchema.safeParse({ ...base, email: "nope" })
				.success,
		).toBe(false);
	});
});

describe("verifyOtpBodySchema", () => {
	it("requires a 6-digit otp", () => {
		expect(
			verifyOtpBodySchema.safeParse({
				phone: "08012345678",
				otp: "123456",
			}).success,
		).toBe(true);
		expect(
			verifyOtpBodySchema.safeParse({
				phone: "08012345678",
				otp: "12345",
			}).success,
		).toBe(false);
		expect(
			verifyOtpBodySchema.safeParse({
				phone: "08012345678",
				otp: "abcdef",
			}).success,
		).toBe(false);
	});
});

describe("placeOrderBodySchema", () => {
	it("accepts a valid pickup order and coerces quantity", () => {
		const parsed = placeOrderBodySchema.safeParse({
			dailyOrderId: "d1",
			fulfillmentType: FulfillmentType.PICKUP,
			items: [{ dailyOrderItemId: "i1", quantity: "2" }],
		});
		expect(parsed.success).toBe(true);
		if (parsed.success) expect(parsed.data.items[0].quantity).toBe(2);
	});

	it("rejects empty item list", () => {
		expect(
			placeOrderBodySchema.safeParse({
				dailyOrderId: "d1",
				fulfillmentType: FulfillmentType.PICKUP,
				items: [],
			}).success,
		).toBe(false);
	});

	it("rejects quantity above 50", () => {
		expect(
			placeOrderBodySchema.safeParse({
				dailyOrderId: "d1",
				fulfillmentType: FulfillmentType.DELIVERY,
				items: [{ dailyOrderItemId: "i1", quantity: 51 }],
			}).success,
		).toBe(false);
	});
});

describe("updateOrderStatusBodySchema / cancelOrderBodySchema", () => {
	it("allows the vendor-transition statuses", () => {
		expect(
			updateOrderStatusBodySchema.safeParse({
				status: OrderStatus.PREPARING,
			}).success,
		).toBe(true);
		expect(
			updateOrderStatusBodySchema.safeParse({
				status: OrderStatus.PENDING_PAYMENT,
			}).success,
		).toBe(false);
	});

	it("requires a cancellation reason", () => {
		expect(cancelOrderBodySchema.safeParse({ reason: "" }).success).toBe(
			false,
		);
		expect(
			cancelOrderBodySchema.safeParse({ reason: "Changed mind" }).success,
		).toBe(true);
	});
});

describe("createReviewSchema", () => {
	it("accepts a valid review", () => {
		expect(
			createReviewSchema.safeParse({
				buyerOrderId: "o1",
				rating: 5,
				comment: "Great",
			}).success,
		).toBe(true);
	});

	it("rejects out-of-range ratings", () => {
		expect(
			createReviewSchema.safeParse({ buyerOrderId: "o1", rating: 0 })
				.success,
		).toBe(false);
		expect(
			createReviewSchema.safeParse({ buyerOrderId: "o1", rating: 6 })
				.success,
		).toBe(false);
	});
});

describe("users/validate parseUpdateProfile", () => {
	it("returns parsed data for a valid partial", () => {
		expect(parseUpdateProfile({ firstName: "New" })).toEqual({
			firstName: "New",
		});
	});

	it("throws ErrInvalidFields on unknown keys", () => {
		expect(() => parseUpdateProfile({ nope: 1 })).toThrow();
	});

	it("schema rejects empty string names", () => {
		expect(updateProfileSchema.safeParse({ firstName: "" }).success).toBe(
			false,
		);
	});
});

describe("vendors locationSchema (discriminated union)", () => {
	it("accepts ON_CAMPUS with hostel name", () => {
		expect(
			locationSchema.safeParse({
				locationType: "ON_CAMPUS",
				hostelOrStallName: "Block A",
			}).success,
		).toBe(true);
	});

	it("accepts OFF_CAMPUS with state + address", () => {
		expect(
			locationSchema.safeParse({
				locationType: "OFF_CAMPUS",
				state: "Lagos",
				areaOrAddress: "12 Allen Ave",
			}).success,
		).toBe(true);
	});

	it("rejects ON_CAMPUS missing hostel name", () => {
		expect(
			locationSchema.safeParse({ locationType: "ON_CAMPUS" }).success,
		).toBe(false);
	});
});

describe("menu createMenuItemSchema", () => {
	it("accepts a valid item and rejects non-positive price", () => {
		expect(
			createMenuItemSchema.safeParse({
				name: "Rice",
				category: "MEALS",
				priceNaira: 500,
			}).success,
		).toBe(true);
		expect(
			createMenuItemSchema.safeParse({
				name: "Rice",
				category: "MEALS",
				priceNaira: 0,
			}).success,
		).toBe(false);
		expect(
			createMenuItemSchema.safeParse({
				name: "Rice",
				category: "NOPE",
				priceNaira: 500,
			}).success,
		).toBe(false);
	});
});

describe("dailyOrders createDailyOrderSchema", () => {
	it("accepts a valid listing", () => {
		expect(
			createDailyOrderSchema.safeParse({
				title: "Lunch",
				scheduledDate: new Date().toISOString(),
				cutoffTime: new Date().toISOString(),
				items: [{ menuItemId: "m1" }],
			}).success,
		).toBe(true);
	});

	it("rejects non-datetime strings and empty items", () => {
		expect(
			createDailyOrderSchema.safeParse({
				title: "Lunch",
				scheduledDate: "not-a-date",
				cutoffTime: new Date().toISOString(),
				items: [{ menuItemId: "m1" }],
			}).success,
		).toBe(false);
		expect(
			createDailyOrderSchema.safeParse({
				title: "Lunch",
				scheduledDate: new Date().toISOString(),
				cutoffTime: new Date().toISOString(),
				items: [],
			}).success,
		).toBe(false);
	});

	it("accepts a same-day close but rejects a close past the menu date", () => {
		const menu = new Date("2026-07-11T00:00:00.000Z");
		const sameDayClose = new Date("2026-07-11T18:00:00.000Z"); // same calendar day
		const nextDayClose = new Date("2026-07-12T09:00:00.000Z"); // day after menu
		const base = {
			title: "Lunch",
			scheduledDate: menu.toISOString(),
			items: [{ menuItemId: "m1" }],
		};
		expect(
			createDailyOrderSchema.safeParse({
				...base,
				cutoffTime: sameDayClose.toISOString(),
			}).success,
		).toBe(true);
		expect(
			createDailyOrderSchema.safeParse({
				...base,
				cutoffTime: nextDayClose.toISOString(),
			}).success,
		).toBe(false);
	});
});

describe("dailyOrders marketplaceSearchSchema", () => {
	it("requires campusId and a non-empty query, coercing limit", () => {
		const ok = marketplaceSearchSchema.safeParse({
			campusId: "c1",
			q: "  jollof ",
			limit: "10",
		});
		expect(ok.success).toBe(true);
		if (ok.success) {
			expect(ok.data.q).toBe("jollof");
			expect(ok.data.limit).toBe(10);
		}
		expect(
			marketplaceSearchSchema.safeParse({ campusId: "c1", q: "" })
				.success,
		).toBe(false);
		expect(marketplaceSearchSchema.safeParse({ q: "x" }).success).toBe(
			false,
		);
		expect(
			marketplaceSearchSchema.safeParse({
				campusId: "c1",
				q: "x",
				extra: 1,
			}).success,
		).toBe(false);
	});
});

describe("dailyOrders myDailyOrdersQuerySchema", () => {
	it("accepts and coerces status, search, date range and paging", () => {
		const parsed = myDailyOrdersQuerySchema.safeParse({
			status: "ACTIVE",
			q: "  jollof  ",
			from: "2026-07-10",
			to: "2026-07-14",
			limit: "20",
			offset: "0",
		});
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.data.q).toBe("jollof"); // trimmed
			expect(parsed.data.from).toBeInstanceOf(Date);
			expect(parsed.data.to).toBeInstanceOf(Date);
			expect(parsed.data.limit).toBe(20); // coerced to number
		}
	});

	it("accepts an empty query (no filters)", () => {
		expect(myDailyOrdersQuerySchema.safeParse({}).success).toBe(true);
	});

	it("rejects unknown keys, bad status, and an inverted range", () => {
		expect(myDailyOrdersQuerySchema.safeParse({ nope: "x" }).success).toBe(
			false,
		);
		expect(
			myDailyOrdersQuerySchema.safeParse({ status: "BOGUS" }).success,
		).toBe(false);
		expect(myDailyOrdersQuerySchema.safeParse({ q: "" }).success).toBe(
			false,
		);
		// `from` after `to` is contradictory.
		expect(
			myDailyOrdersQuerySchema.safeParse({
				from: "2026-07-20",
				to: "2026-07-10",
			}).success,
		).toBe(false);
	});
});
