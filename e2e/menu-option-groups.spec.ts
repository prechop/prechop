import {
	type APIRequestContext,
	expect,
	request,
	test,
} from "@playwright/test";
import { authenticatedRequest, VENDOR_EMAIL } from "./auth";

async function login(): Promise<APIRequestContext> {
	return authenticatedRequest(request, VENDOR_EMAIL);
}

test.describe("menu option groups", () => {
	test("vendor creates a group, attaches it to a menu item, and it round-trips", async () => {
		const vendor = await login();

		const create = await vendor.post("/api/menu/option-groups", {
			data: {
				name: `Protein ${Date.now()}`,
				required: true,
				minSelect: 1,
				maxSelect: 1,
				options: [
					{ name: "Chicken", priceNaira: 500 },
					{ name: "Beef", priceNaira: 600 },
				],
			},
		});
		expect(create.status(), await create.text()).toBe(201);
		const created = (await create.json()).data;
		expect(created.options).toHaveLength(2);
		expect(created.options[0].priceKobo).toBe(50000);
		const groupId = String(created._id);

		const list = await vendor.get("/api/menu/option-groups");
		expect(list.ok()).toBeTruthy();
		const groups = (await list.json()).data as Array<{ id: string }>;
		expect(groups.some((g) => g.id === groupId)).toBeTruthy();

		const item = await vendor.post("/api/menu", {
			data: {
				name: `Special ${Date.now()}`,
				category: "MEALS",
				priceNaira: 1500,
				optionGroupIds: [groupId],
			},
		});
		expect(item.status(), await item.text()).toBe(201);
		const itemId = String((await item.json()).data._id);

		const menu = await vendor.get("/api/menu");
		const menuItems = (await menu.json()).data as Array<{
			id: string;
			optionGroupIds: string[];
		}>;
		const found = menuItems.find((m) => m.id === itemId);
		expect(found?.optionGroupIds).toContain(groupId);

		await vendor.patch(`/api/menu/${itemId}`, {
			data: { optionGroupIds: [] },
		});
		await vendor.delete(`/api/menu/${itemId}`);
		await vendor.delete(`/api/menu/option-groups/${groupId}`);
		await vendor.dispose();
	});

	test("rejects an invalid option group (required with no minimum)", async () => {
		const vendor = await login();
		const res = await vendor.post("/api/menu/option-groups", {
			data: {
				name: "Bad group",
				required: true,
				minSelect: 0,
				options: [{ name: "X", priceNaira: 0 }],
			},
		});
		expect(res.status()).toBe(400);
		await vendor.dispose();
	});

	test("rejects attaching an option group the vendor does not own", async () => {
		const vendor = await login();
		const res = await vendor.post("/api/menu", {
			data: {
				name: `Ghost ${Date.now()}`,
				category: "MEALS",
				priceNaira: 1000,
				optionGroupIds: ["ffffffffffffffffffffffff"],
			},
		});
		expect(res.status()).toBe(400);
		await vendor.dispose();
	});
});
