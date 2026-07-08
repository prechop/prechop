import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MenuCategory } from "@/server/models/enums";
import {
	countMenuItemsByVendorDB,
	createMenuItemDB,
	getMenuItemByIdDB,
	getMenuItemsByIdsDB,
	listMenuItemsByVendorDB,
	softDeleteMenuItemDB,
	updateMenuItemDB,
} from "@/server/models/menuItems";
import { connectTestDB, dropAndDisconnect, oid } from "../helpers/db";

beforeAll(async () => {
	await connectTestDB();
});

afterAll(async () => {
	await dropAndDisconnect();
});

describe("menuItems model", () => {
	it("creates, reads, updates and soft-deletes", async () => {
		const vendorId = oid();
		const campusId = oid();
		const item = await createMenuItemDB({
			payload: {
				vendorId,
				campusId,
				category: MenuCategory.MEALS,
				name: "Jollof Rice",
				priceKobo: 150000,
			},
		});
		expect(item).not.toBeNull();
		expect(item!.isAvailable).toBe(true);
		expect(item!.estimatedPrepMin).toBe(20);

		const id = item!._id.toString();
		const byId = await getMenuItemByIdDB({ id });
		expect(byId!.name).toBe("Jollof Rice");

		const updated = await updateMenuItemDB({
			id,
			vendorId,
			payload: { priceKobo: 200000, isSoldOut: true },
		});
		expect(updated!.priceKobo).toBe(200000);
		expect(updated!.isSoldOut).toBe(true);

		// wrong vendor cannot update
		const wrong = await updateMenuItemDB({
			id,
			vendorId: oid(),
			payload: { priceKobo: 1 },
		});
		expect(wrong).toBeNull();

		expect(await softDeleteMenuItemDB({ id, vendorId })).toBe(true);
		// soft-deleted items are hidden from aggregate reads
		expect(await getMenuItemByIdDB({ id })).toBeNull();
	});

	it("lists by vendor with filters and counts non-deleted", async () => {
		const vendorId = oid();
		const campusId = oid();
		await createMenuItemDB({
			payload: {
				vendorId,
				campusId,
				category: MenuCategory.DRINKS,
				name: "Zobo",
				priceKobo: 50000,
				displayOrder: 2,
			},
		});
		await createMenuItemDB({
			payload: {
				vendorId,
				campusId,
				category: MenuCategory.SNACKS,
				name: "Puff Puff",
				priceKobo: 20000,
				displayOrder: 1,
			},
		});
		const all = await listMenuItemsByVendorDB({ vendorId });
		expect(all.length).toBe(2);
		// sorted by displayOrder ascending
		expect(all[0].name).toBe("Puff Puff");

		const drinks = await listMenuItemsByVendorDB({
			vendorId,
			category: MenuCategory.DRINKS,
		});
		expect(drinks.length).toBe(1);

		expect(await countMenuItemsByVendorDB({ vendorId })).toBe(2);
	});

	it("fetches many by ids", async () => {
		const vendorId = oid();
		const a = await createMenuItemDB({
			payload: {
				vendorId,
				campusId: oid(),
				category: MenuCategory.MEALS,
				name: "A",
				priceKobo: 1000,
			},
		});
		const b = await createMenuItemDB({
			payload: {
				vendorId,
				campusId: oid(),
				category: MenuCategory.MEALS,
				name: "B",
				priceKobo: 2000,
			},
		});
		const many = await getMenuItemsByIdsDB({
			ids: [a!._id.toString(), b!._id.toString(), "invalid"],
		});
		expect(many.length).toBe(2);
	});
});
