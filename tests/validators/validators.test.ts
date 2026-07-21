import { describe, expect, it } from "vitest";
import { FulfillmentType, OrderStatus } from "@/server/models/enums";
import {
	emailSignInRequestBodySchema,
	emailSignInVerifyQuerySchema,
	googleCallbackQuerySchema,
	googleStartQuerySchema,
} from "@/server/validators/auth/validate";
import {
	cancelOrderBodySchema,
	placeOrderBodySchema,
	updateOrderStatusBodySchema,
} from "@/server/validators/buyerOrders/validate";
import {
	createDailyOrderSchema,
	marketplaceQuerySchema,
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

describe("auth passwordless schemas", () => {
	it("accepts and normalizes email sign-in requests", () => {
		const parsed = emailSignInRequestBodySchema.safeParse({
			email: "  ADA@Example.COM  ",
			next: "/checkout?dailyOrderId=d1",
		});
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.data.email).toBe("ada@example.com");
			expect(parsed.data.next).toBe("/checkout?dailyOrderId=d1");
		}
	});

	it("rejects bad email, external redirects and extra keys", () => {
		expect(
			emailSignInRequestBodySchema.safeParse({ email: "not-email" })
				.success,
		).toBe(false);
		expect(
			emailSignInRequestBodySchema.safeParse({
				email: "ada@example.com",
				next: "//evil.test",
			}).success,
		).toBe(false);
		expect(
			emailSignInRequestBodySchema.safeParse({
				email: "ada@example.com",
				extra: true,
			}).success,
		).toBe(false);
	});

	it("validates email callback tokens and Google start/callback params", () => {
		expect(
			emailSignInVerifyQuerySchema.safeParse({
				token: "a".repeat(20),
				next: "/vendor/settings",
			}).success,
		).toBe(true);
		expect(
			emailSignInVerifyQuerySchema.safeParse({ token: "short" }).success,
		).toBe(false);
		expect(
			googleStartQuerySchema.safeParse({ next: "/cart" }).success,
		).toBe(true);
		expect(
			googleCallbackQuerySchema.safeParse({
				code: "google-code",
				state: "s".repeat(20),
			}).success,
		).toBe(true);
		expect(
			googleCallbackQuerySchema.safeParse({ error: "access_denied" })
				.success,
		).toBe(true);
	});
});

describe("placeOrderBodySchema", () => {
	it("accepts a valid pickup order and coerces quantity", () => {
		const parsed = placeOrderBodySchema.safeParse({
			dailyOrderId: "d1",
			fulfillmentType: FulfillmentType.PICKUP,
			customerMessage: "  No pepper, thanks  ",
			deliveryPhone: "  +2348012345678  ",
			items: [{ dailyOrderItemId: "i1", quantity: "2" }],
		});
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.data.items[0].quantity).toBe(2);
			expect(parsed.data.customerMessage).toBe("No pepper, thanks");
			expect(parsed.data.deliveryPhone).toBe("+2348012345678");
		}
	});

	it("accepts selected add-on quantities", () => {
		const parsed = placeOrderBodySchema.safeParse({
			dailyOrderId: "d1",
			fulfillmentType: FulfillmentType.PICKUP,
			items: [
				{
					dailyOrderItemId: "i1",
					quantity: 1,
					selectedOptions: [{ optionId: "o1", quantity: "3" }],
				},
			],
		});

		expect(parsed.success).toBe(true);
		if (parsed.success)
			expect(parsed.data.items[0].selectedOptions?.[0].quantity).toBe(3);
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

	it("rejects a customer message above 150 characters", () => {
		expect(
			placeOrderBodySchema.safeParse({
				dailyOrderId: "d1",
				fulfillmentType: FulfillmentType.PICKUP,
				customerMessage: "x".repeat(151),
				items: [{ dailyOrderItemId: "i1", quantity: 1 }],
			}).success,
		).toBe(false);
	});

	it("rejects a delivery phone above 30 characters", () => {
		expect(
			placeOrderBodySchema.safeParse({
				dailyOrderId: "d1",
				fulfillmentType: FulfillmentType.DELIVERY,
				deliveryPhone: "1".repeat(31),
				items: [{ dailyOrderItemId: "i1", quantity: 1 }],
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
				status: OrderStatus.IN_TRANSIT,
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
				campusId: "64b64c9f9f1b2c0012345678",
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
				campusIds: ["64b64c9f9f1b2c0012345678"],
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

	it("accepts same-day and future close dates", () => {
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
		).toBe(true);
	});
});

describe("dailyOrders marketplaceSearchSchema", () => {
	it("accepts optional campusId and a non-empty query, coercing limit", () => {
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
			true,
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

describe("dailyOrders marketplaceQuerySchema — paging cap", () => {
	// REGRESSION: the web client requests the marketplace with `limit=50`, but the
	// schema was capped at 20, so the real client 400'd on every load. The cap was
	// raised to 50. This pins that the client's real value is accepted, and that
	// the cap is still enforced one past it.
	it("accepts the client's real limit=50", () => {
		const parsed = marketplaceQuerySchema.safeParse({
			campusId: "c1",
			limit: "50",
		});
		expect(parsed.success).toBe(true);
		if (parsed.success) expect(parsed.data.limit).toBe(50); // coerced to number
	});

	it("accepts no campusId for the all-campus guest feed", () => {
		const parsed = marketplaceQuerySchema.safeParse({ limit: "50" });
		expect(parsed.success).toBe(true);
		if (parsed.success) expect(parsed.data.campusId).toBeUndefined();
	});

	it("still rejects a limit past the cap (51)", () => {
		expect(
			marketplaceQuerySchema.safeParse({ campusId: "c1", limit: "51" })
				.success,
		).toBe(false);
	});

	it("rejects a non-positive limit and unknown keys", () => {
		expect(
			marketplaceQuerySchema.safeParse({ campusId: "c1", limit: "0" })
				.success,
		).toBe(false);
		expect(
			marketplaceQuerySchema.safeParse({ campusId: "c1", nope: 1 })
				.success,
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
