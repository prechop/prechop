import { describe, expect, it } from "vitest";
import { MenuCategory } from "@/server/models";
import { FulfillmentType } from "@/server/models/enums";
import { updateSiteConfigsSchema } from "@/server/validators/admin/validate";
import { placeOrderBodySchema } from "@/server/validators/buyerOrders/validate";
import { createDailyOrderSchema } from "@/server/validators/dailyOrders/validate";
import { createOptionGroupSchema } from "@/server/validators/menu/optionGroups";
import { createMenuItemSchema } from "@/server/validators/menu/validate";

// The client-side shared `Input` component now blocks negative entry, but the
// server is the enforced boundary. These pure-zod checks lock the contract that
// no numeric field — buyer quantity, prices, counts, fees — can ever be
// persisted with a negative value, regardless of what a crafted client sends.

describe("negative-input rejection (server validators)", () => {
	it("rejects a negative buyer order quantity", () => {
		const bad = placeOrderBodySchema.safeParse({
			dailyOrderId: "d1",
			fulfillmentType: FulfillmentType.PICKUP,
			items: [{ dailyOrderItemId: "i1", quantity: -3 }],
		});
		expect(bad.success).toBe(false);
	});

	it("rejects a zero buyer order quantity (min is 1)", () => {
		const bad = placeOrderBodySchema.safeParse({
			dailyOrderId: "d1",
			fulfillmentType: FulfillmentType.PICKUP,
			items: [{ dailyOrderItemId: "i1", quantity: 0 }],
		});
		expect(bad.success).toBe(false);
	});

	it("accepts a valid buyer order quantity", () => {
		const ok = placeOrderBodySchema.safeParse({
			dailyOrderId: "d1",
			fulfillmentType: FulfillmentType.PICKUP,
			items: [{ dailyOrderItemId: "i1", quantity: 2 }],
		});
		expect(ok.success).toBe(true);
	});

	it("rejects a negative menu item price", () => {
		const bad = createMenuItemSchema.safeParse({
			name: "Jollof",
			category: MenuCategory.MEALS,
			priceNaira: -100,
		});
		expect(bad.success).toBe(false);
	});

	it("rejects a negative menu item prep time", () => {
		const bad = createMenuItemSchema.safeParse({
			name: "Jollof",
			category: MenuCategory.MEALS,
			priceNaira: 1500,
			estimatedPrepMin: -5,
		});
		expect(bad.success).toBe(false);
	});

	it("rejects a negative option price and negative minSelect", () => {
		const badPrice = createOptionGroupSchema.safeParse({
			name: "Protein",
			options: [{ name: "Chicken", priceNaira: -50 }],
		});
		expect(badPrice.success).toBe(false);

		const badMin = createOptionGroupSchema.safeParse({
			name: "Protein",
			minSelect: -1,
			options: [{ name: "Chicken", priceNaira: 0 }],
		});
		expect(badMin.success).toBe(false);
	});

	it("rejects a negative daily-order max quantity and delivery fee", () => {
		const base = {
			title: "Lunch",
			scheduledDate: "2026-07-10T10:00:00.000Z",
			cutoffTime: "2026-07-10T09:00:00.000Z",
		};
		expect(
			createDailyOrderSchema.safeParse({
				...base,
				items: [{ menuItemId: "m1", maxQuantity: -2 }],
			}).success,
		).toBe(false);
		expect(
			createDailyOrderSchema.safeParse({
				...base,
				deliveryFeeKobo: -100,
				items: [{ menuItemId: "m1" }],
			}).success,
		).toBe(false);
	});

	it("rejects negative admin site-config values", () => {
		expect(
			updateSiteConfigsSchema.safeParse({ platformFeeBuyerKobo: -1 })
				.success,
		).toBe(false);
		expect(
			updateSiteConfigsSchema.safeParse({ slotHoldTtlSeconds: -30 })
				.success,
		).toBe(false);
	});
});
