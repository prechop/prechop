import { describe, expect, it } from "vitest";
import {
	createOptionGroupSchema,
	updateOptionGroupSchema,
} from "@/server/validators/menu/optionGroups";

describe("createOptionGroupSchema", () => {
	it("accepts a well-formed required single-select group", () => {
		const r = createOptionGroupSchema.safeParse({
			name: "Protein",
			required: true,
			minSelect: 1,
			maxSelect: 1,
			options: [
				{ name: "Chicken", priceNaira: 500 },
				{ name: "Beef", priceNaira: 600 },
			],
		});
		expect(r.success).toBe(true);
	});

	it("accepts an optional group with default rules", () => {
		const r = createOptionGroupSchema.safeParse({
			name: "Extras",
			options: [{ name: "Egg", priceNaira: 0 }],
		});
		expect(r.success).toBe(true);
	});

	it("rejects an empty options list", () => {
		const r = createOptionGroupSchema.safeParse({
			name: "Empty",
			options: [],
		});
		expect(r.success).toBe(false);
	});

	it("rejects required with minSelect 0", () => {
		const r = createOptionGroupSchema.safeParse({
			name: "Protein",
			required: true,
			minSelect: 0,
			options: [{ name: "Chicken", priceNaira: 500 }],
		});
		expect(r.success).toBe(false);
	});

	it("rejects minSelect greater than the number of options", () => {
		const r = createOptionGroupSchema.safeParse({
			name: "Protein",
			minSelect: 3,
			options: [{ name: "Chicken", priceNaira: 500 }],
		});
		expect(r.success).toBe(false);
	});

	it("rejects maxSelect below minSelect", () => {
		const r = createOptionGroupSchema.safeParse({
			name: "Protein",
			minSelect: 2,
			maxSelect: 1,
			options: [
				{ name: "A", priceNaira: 1 },
				{ name: "B", priceNaira: 1 },
			],
		});
		expect(r.success).toBe(false);
	});

	it("rejects unknown keys (strict)", () => {
		const r = createOptionGroupSchema.safeParse({
			name: "X",
			options: [{ name: "A", priceNaira: 1 }],
			bogus: true,
		});
		expect(r.success).toBe(false);
	});
});

describe("updateOptionGroupSchema", () => {
	it("allows a partial name-only update", () => {
		const r = updateOptionGroupSchema.safeParse({ name: "Renamed" });
		expect(r.success).toBe(true);
	});

	it("re-validates rules when options are supplied", () => {
		const r = updateOptionGroupSchema.safeParse({
			required: true,
			minSelect: 0,
			options: [{ name: "A", priceNaira: 1 }],
		});
		expect(r.success).toBe(false);
	});
});
