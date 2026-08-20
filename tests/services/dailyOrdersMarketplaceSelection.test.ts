import { describe, expect, it } from "vitest";
import type { IDailyOrder } from "@/server/models";
import { orderMarketplaceListingsForVendor } from "@/server/services/dailyOrders/queries";

function listing({
	id,
	scheduledDate,
	items,
}: {
	id: string;
	scheduledDate: string;
	items: Array<{
		id: string;
		name: string;
		remainingQuantity?: number | null;
		maxQuantity?: number | null;
		orderedQuantity?: number;
		reservedQuantity?: number;
	}>;
}) {
	return {
		_id: id,
		id,
		scheduledDate: new Date(scheduledDate),
		items: items.map((item) => ({
			id: item.id,
			menuItemId: item.id,
			snapshotName: item.name,
			snapshotPriceKobo: 1000,
			snapshotPrepMin: 10,
			orderedQuantity: item.orderedQuantity ?? 0,
			reservedQuantity: item.reservedQuantity ?? 0,
			remainingQuantity: item.remainingQuantity,
			maxQuantity: item.maxQuantity,
			optionGroups: [],
			snapshotVariants: [],
		})),
	} as unknown as IDailyOrder;
}

describe("orderMarketplaceListingsForVendor", () => {
	it("puts an available menu ahead of a sold-out menu on the marketplace card", () => {
		const [primary] = orderMarketplaceListingsForVendor([
			listing({
				id: "older-sold-out",
				scheduledDate: "2026-08-01T10:00:00.000Z",
				items: [
					{
						id: "egusi",
						name: "Egusi",
						remainingQuantity: 0,
					},
				],
			}),
			listing({
				id: "newer-available",
				scheduledDate: "2026-08-02T10:00:00.000Z",
				items: [
					{
						id: "jollof",
						name: "Jollof",
						remainingQuantity: 4,
					},
				],
			}),
		]);

		expect(primary?.items[0].snapshotName).toBe("Jollof");
	});

	it("uses the newest available listing when several menus are available", () => {
		const [primary] = orderMarketplaceListingsForVendor([
			listing({
				id: "older",
				scheduledDate: "2026-08-01T10:00:00.000Z",
				items: [{ id: "rice", name: "Rice", remainingQuantity: 8 }],
			}),
			listing({
				id: "newer",
				scheduledDate: "2026-08-02T10:00:00.000Z",
				items: [{ id: "beans", name: "Beans", remainingQuantity: 5 }],
			}),
		]);

		expect(primary?._id).toBe("newer");
		expect(primary?.items[0].snapshotName).toBe("Beans");
	});

	it("keeps sold-out menus as fallback when every active menu is sold out", () => {
		const [primary] = orderMarketplaceListingsForVendor([
			listing({
				id: "older-sold-out",
				scheduledDate: "2026-08-01T10:00:00.000Z",
				items: [{ id: "yam", name: "Yam", remainingQuantity: 0 }],
			}),
			listing({
				id: "newer-sold-out",
				scheduledDate: "2026-08-02T10:00:00.000Z",
				items: [{ id: "beans", name: "Beans", remainingQuantity: 0 }],
			}),
		]);

		expect(primary?._id).toBe("newer-sold-out");
		expect(primary?.items[0].snapshotName).toBe("Beans");
	});

	it("moves a restored-stock menu back ahead of sold-out menus", () => {
		const restored = listing({
			id: "restored",
			scheduledDate: "2026-08-01T10:00:00.000Z",
			items: [{ id: "akara", name: "Akara", remainingQuantity: 2 }],
		});
		const soldOut = listing({
			id: "sold-out",
			scheduledDate: "2026-08-02T10:00:00.000Z",
			items: [{ id: "rice", name: "Rice", remainingQuantity: 0 }],
		});

		const [primary] = orderMarketplaceListingsForVendor([
			soldOut,
			restored,
		]);

		expect(primary?._id).toBe("restored");
		expect(primary?.items[0].snapshotName).toBe("Akara");
	});
});
