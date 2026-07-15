// Reusable vendor option groups: the CRUD a vendor uses to define "Protein:
// Chicken/Beef" once and attach it to many menu items, plus the ownership
// resolver that stops one vendor referencing another's groups at checkout.
//
// Nothing mocked — real vendor, real groups in the scratch DB. The service layer
// (naira→kobo conversion, ownership scoping, not-found mapping) is what's under
// test, so a regression in any of those actually fails here.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getOptionGroupsByIdsDB } from "@/server/models";
import {
	createOptionGroup,
	deleteOptionGroup,
	listOptionGroups,
	updateOptionGroup,
} from "@/server/services/menu/optionGroups";
import { resolveOwnedOptionGroupIds } from "@/server/services/menu/optionGroupsResolve";
import { connectTestDB, dropAndDisconnect, oid } from "../helpers/db";
import { makeVendor } from "../helpers/factories";

let userId: string;
let vendorId: string;

beforeAll(async () => {
	await connectTestDB();
	const v = await makeVendor();
	userId = v.userId;
	vendorId = v.vendorId;
});

afterAll(async () => {
	await dropAndDisconnect();
});

describe("createOptionGroup", () => {
	it("creates a group and converts option prices from naira to kobo", async () => {
		const group = await createOptionGroup({
			userId,
			name: "Protein",
			required: true,
			minSelect: 1,
			maxSelect: 2,
			displayOrder: 0,
			options: [
				{ name: "Chicken", priceNaira: 200 },
				{ name: "Beef", priceNaira: 250 },
			],
		});

		expect(group.name).toBe("Protein");
		expect(group.required).toBe(true);
		expect(group.minSelect).toBe(1);
		expect(group.maxSelect).toBe(2);
		// ₦200 -> 20000 kobo. The naira→kobo conversion is the service's job.
		const prices = group.options
			.map((o) => o.priceKobo)
			.sort((a, b) => a - b);
		expect(prices).toEqual([20000, 25000]);
	});

	it("defaults an absent maxSelect to null (unbounded)", async () => {
		const group = await createOptionGroup({
			userId,
			name: "Extras",
			required: false,
			minSelect: 0,
			displayOrder: 1,
			options: [{ name: "Plantain", priceNaira: 100 }],
		});
		expect(group.maxSelect).toBeNull();
	});
});

describe("listOptionGroups", () => {
	it("returns only this vendor's groups", async () => {
		const groups = await listOptionGroups({ userId });
		expect(groups.length).toBeGreaterThanOrEqual(2);
		expect(groups.every((g) => g.vendorId.toString() === vendorId)).toBe(
			true,
		);
	});

	it("does not surface another vendor's groups", async () => {
		const other = await makeVendor();
		await createOptionGroup({
			userId: other.userId,
			name: "Other Protein",
			required: false,
			minSelect: 0,
			displayOrder: 0,
			options: [{ name: "Fish", priceNaira: 300 }],
		});

		const mine = await listOptionGroups({ userId });
		expect(mine.some((g) => g.name === "Other Protein")).toBe(false);
	});
});

describe("updateOptionGroup", () => {
	it("updates fields and re-converts option prices", async () => {
		const created = await createOptionGroup({
			userId,
			name: "Sauce",
			required: false,
			minSelect: 0,
			displayOrder: 2,
			options: [{ name: "Mild", priceNaira: 0 }],
		});

		const updated = await updateOptionGroup({
			userId,
			groupId: (created.id ?? created._id).toString(),
			name: "Sauce (new)",
			options: [
				{ name: "Mild", priceNaira: 0 },
				{ name: "Hot", priceNaira: 150 },
			],
		});
		expect(updated.name).toBe("Sauce (new)");
		expect(updated.options).toHaveLength(2);
		expect(
			updated.options.map((o) => o.priceKobo).sort((a, b) => a - b),
		).toEqual([0, 15000]);
	});

	it("throws not-found for a group that isn't this vendor's", async () => {
		await expect(
			updateOptionGroup({
				userId,
				groupId: oid(), // no such group for this vendor
				name: "Nope",
			}),
		).rejects.toThrow();
	});
});

describe("deleteOptionGroup", () => {
	it("soft-deletes an owned group", async () => {
		const created = await createOptionGroup({
			userId,
			name: "Disposable",
			required: false,
			minSelect: 0,
			displayOrder: 3,
			options: [{ name: "X", priceNaira: 0 }],
		});
		const res = await deleteOptionGroup({
			userId,
			groupId: (created.id ?? created._id).toString(),
		});
		expect(res).toEqual({ deleted: true });

		const mine = await listOptionGroups({ userId });
		expect(mine.some((g) => g.name === "Disposable")).toBe(false);
	});

	it("throws not-found when deleting a group this vendor doesn't own", async () => {
		await expect(
			deleteOptionGroup({ userId, groupId: oid() }),
		).rejects.toThrow();
	});
});

describe("resolveOwnedOptionGroupIds — checkout ownership guard", () => {
	it("returns undefined when the field is absent (leave unchanged)", async () => {
		await expect(
			resolveOwnedOptionGroupIds({ vendorId, optionGroupIds: undefined }),
		).resolves.toBeUndefined();
	});

	it("returns [] for an explicitly empty list (clear the list)", async () => {
		await expect(
			resolveOwnedOptionGroupIds({ vendorId, optionGroupIds: [] }),
		).resolves.toEqual([]);
	});

	it("accepts owned ids and de-duplicates while preserving order", async () => {
		const g1 = await createOptionGroup({
			userId,
			name: "Resolve A",
			required: false,
			minSelect: 0,
			displayOrder: 0,
			options: [{ name: "a", priceNaira: 0 }],
		});
		const g2 = await createOptionGroup({
			userId,
			name: "Resolve B",
			required: false,
			minSelect: 0,
			displayOrder: 0,
			options: [{ name: "b", priceNaira: 0 }],
		});
		const id1 = (g1.id ?? g1._id).toString();
		const id2 = (g2.id ?? g2._id).toString();

		const resolved = await resolveOwnedOptionGroupIds({
			vendorId,
			optionGroupIds: [id1, id2, id1], // duplicate id1
		});
		expect(resolved).toEqual([id1, id2]);
		// And they really are this vendor's groups.
		const found = await getOptionGroupsByIdsDB({
			ids: [id1, id2],
			vendorId,
		});
		expect(found).toHaveLength(2);
	});

	it("throws when an id belongs to another vendor", async () => {
		const other = await makeVendor();
		const foreign = await createOptionGroup({
			userId: other.userId,
			name: "Foreign",
			required: false,
			minSelect: 0,
			displayOrder: 0,
			options: [{ name: "z", priceNaira: 0 }],
		});
		await expect(
			resolveOwnedOptionGroupIds({
				vendorId, // our vendor
				optionGroupIds: [(foreign.id ?? foreign._id).toString()],
			}),
		).rejects.toThrow(/not found/i);
	});

	it("throws when an id doesn't exist at all", async () => {
		await expect(
			resolveOwnedOptionGroupIds({ vendorId, optionGroupIds: [oid()] }),
		).rejects.toThrow();
	});
});
