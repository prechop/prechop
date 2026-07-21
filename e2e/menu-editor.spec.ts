import { expect, test } from "@playwright/test";
import mongoose from "mongoose";
import { authenticateBrowserContext, VENDOR_EMAIL } from "./auth";
import { ORIGIN } from "./urls";

const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27018";
const DB_NAME = process.env.DB_NAME ?? "prechop";

test.use({ baseURL: ORIGIN });

let mongo: mongoose.mongo.MongoClient;
let createdItemName: string | null = null;

test.beforeAll(async () => {
	mongo = new mongoose.mongo.MongoClient(MONGODB_URI);
	await mongo.connect();
});

test.afterAll(async () => {
	if (createdItemName) {
		await mongo
			.db(DB_NAME)
			.collection("menuitems")
			.deleteMany({ name: createdItemName });
	}
	await mongo?.close();
});

test("add & edit menu items on their own pages", async ({ page }) => {
	const consoleErrors: string[] = [];
	page.on("console", (m) => {
		if (m.type() === "error") consoleErrors.push(m.text());
	});

	await authenticateBrowserContext(page.context(), VENDOR_EMAIL);
	await page.goto("/menu");
	if (new URL(page.url()).pathname.startsWith("/login")) {
		test.skip(
			true,
			"authenticated browser navigation requires secure loopback cookies",
		);
	}

	await expect(
		page.getByRole("heading", { name: "Your menu" }),
	).toBeVisible();
	await expect(page.getByText("Jollof Rice & Chicken").first()).toBeVisible();

	await page
		.getByRole("button", { name: /add item/i })
		.first()
		.click();
	await expect(page).toHaveURL(/\/menu\/new$/);
	await expect(page.getByRole("heading", { name: "New item" })).toBeVisible();

	const priceField = page.getByPlaceholder("1500");
	await priceField.fill("-1800");
	await expect(priceField, "negative price sign stripped").toHaveValue(
		"1800",
	);

	createdItemName = `E2E Suya Wrap ${Date.now()}`;
	await page.getByPlaceholder("Jollof rice & chicken").fill(createdItemName);
	await page.getByPlaceholder("1500").fill("1800");
	await page
		.getByPlaceholder("Smoky party jollof with grilled chicken.")
		.fill("Spicy suya beef in a warm wrap.");
	await page.getByRole("button", { name: "Add item", exact: true }).click();

	await expect(page).toHaveURL(/\/menu$/);
	await expect(page.getByText(createdItemName)).toBeVisible();

	const created = await mongo
		.db(DB_NAME)
		.collection("menuitems")
		.findOne({ name: createdItemName });
	if (!created) throw new Error("created item was not persisted");
	expect(created.priceKobo).toBe(180000);
	const createdId = created._id.toString();

	await page.goto(`/menu/${createdId}/edit`);
	await expect(
		page.getByRole("heading", { name: "Edit item" }),
	).toBeVisible();
	await expect(page.getByPlaceholder("Jollof rice & chicken")).toHaveValue(
		createdItemName,
	);
	await expect(page.getByPlaceholder("1500")).toHaveValue("1800");

	await page.getByPlaceholder("1500").fill("2100");
	await page.getByRole("button", { name: "Save changes" }).click();

	await expect(page).toHaveURL(/\/menu$/);
	const updated = await mongo
		.db(DB_NAME)
		.collection("menuitems")
		.findOne({ _id: created._id });
	expect(updated?.priceKobo, "edit persisted").toBe(210000);

	expect(
		consoleErrors,
		`no console errors during the flow: ${consoleErrors.join(" | ")}`,
	).toEqual([]);
});
