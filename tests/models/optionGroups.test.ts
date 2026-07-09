import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	createOptionGroupDB,
	getOptionGroupsByIdsDB,
	listOptionGroupsByVendorDB,
	softDeleteOptionGroupDB,
	updateOptionGroupDB,
} from "@/server/models/optionGroups";
import { connectTestDB, dropAndDisconnect, oid } from "../helpers/db";

beforeAll(async () => {
	await connectTestDB();
});

afterAll(async () => {
	await dropAndDisconnect();
});

describe("optionGroups model", () => {
	it("creates, reads, updates and soft-deletes with embedded ids", async () => {
		const vendorId = oid();
		const campusId = oid();
		const group = await createOptionGroupDB({
			payload: {
				vendorId,
				campusId,
				name: "Protein",
				required: true,
				minSelect: 1,
				maxSelect: 1,
				options: [
					{ name: "Chicken", priceKobo: 50000 },
					{ name: "Beef", priceKobo: 60000 },
				],
			},
		});
		expect(group).not.toBeNull();
		expect(group!.required).toBe(true);
		expect(group!.options).toHaveLength(2);

		const id = group!._id.toString();
		const [read] = await getOptionGroupsByIdsDB({ ids: [id] });
		expect(read).toBeTruthy();
		// Aggregate stringifies embedded option ids.
		expect(typeof read.options[0].id).toBe("string");
		expect(read.options[0].displayOrder).toBe(0);

		const updated = await updateOptionGroupDB({
			id,
			vendorId,
			payload: { name: "Choose protein", maxSelect: 2 },
		});
		expect(updated!.name).toBe("Choose protein");
		expect(updated!.maxSelect).toBe(2);

		const listed = await listOptionGroupsByVendorDB({ vendorId });
		expect(listed).toHaveLength(1);

		const removed = await softDeleteOptionGroupDB({ id, vendorId });
		expect(removed).toBe(true);
		expect(await listOptionGroupsByVendorDB({ vendorId })).toHaveLength(0);
	});

	it("scopes reads to the owning vendor", async () => {
		const vendorId = oid();
		const other = oid();
		const g = await createOptionGroupDB({
			payload: {
				vendorId,
				campusId: oid(),
				name: "Sides",
				options: [{ name: "Plantain", priceKobo: 30000 }],
			},
		});
		const id = g!._id.toString();
		expect(
			await getOptionGroupsByIdsDB({ ids: [id], vendorId: other }),
		).toHaveLength(0);
		expect(
			await getOptionGroupsByIdsDB({ ids: [id], vendorId }),
		).toHaveLength(1);
	});

	it("won't update or delete another vendor's group", async () => {
		const vendorId = oid();
		const g = await createOptionGroupDB({
			payload: {
				vendorId,
				campusId: oid(),
				name: "Spice",
				options: [{ name: "Hot", priceKobo: 0 }],
			},
		});
		const id = g!._id.toString();
		expect(
			await updateOptionGroupDB({
				id,
				vendorId: oid(),
				payload: { name: "hacked" },
			}),
		).toBeNull();
		expect(await softDeleteOptionGroupDB({ id, vendorId: oid() })).toBe(
			false,
		);
	});
});
