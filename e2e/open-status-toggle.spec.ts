import { expect, test } from "@playwright/test";
import mongoose from "mongoose";
import { authenticateBrowserContext, BOLA_VENDOR_EMAIL } from "./auth";
import { ORIGIN } from "./urls";

const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27018";
const DB_NAME = process.env.DB_NAME ?? "prechop";

test.use({ baseURL: ORIGIN });

let mongo: mongoose.mongo.MongoClient;

test.beforeAll(async () => {
	mongo = new mongoose.mongo.MongoClient(MONGODB_URI);
	await mongo.connect();
});

test.afterAll(async () => {
	await mongo?.close();
});

async function dbOpen(): Promise<boolean> {
	const v = await mongo
		.db(DB_NAME)
		.collection("vendorprofiles")
		.findOne({ businessName: "Bola's Buka" });
	return Boolean(v?.isOpenForOrders);
}

test("open-for-orders toggle flips, persists to the DB, and survives reload", async ({
	page,
}) => {
	await authenticateBrowserContext(page.context(), BOLA_VENDOR_EMAIL);
	await page.goto("/dashboard");
	if (new URL(page.url()).pathname.startsWith("/login")) {
		test.skip(
			true,
			"authenticated browser navigation requires secure loopback cookies",
		);
	}

	const toggle = page.getByRole("switch", {
		name: "Toggle open for orders",
	});
	await expect(toggle).toBeVisible();
	await expect(toggle).toHaveAttribute("aria-checked", /true|false/);

	async function mouseClickToggle() {
		await page.evaluate(() => window.scrollTo(0, 0));
		const box = await toggle.boundingBox();
		if (!box) throw new Error("toggle has no box");
		await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
	}

	const startedOpen = await dbOpen();
	const openSubtitle = /buyers can order from you right now/i;
	const closedSubtitle = /currently closed for new orders/i;
	await expect(
		page.getByText(startedOpen ? openSubtitle : closedSubtitle),
	).toBeVisible();

	await mouseClickToggle();
	await expect
		.poll(async () => dbOpen(), { timeout: 8_000 })
		.toBe(!startedOpen);
	await expect(
		page.getByText(startedOpen ? closedSubtitle : openSubtitle),
	).toBeVisible();

	await page.reload();
	await expect(
		page.getByText(startedOpen ? closedSubtitle : openSubtitle),
	).toBeVisible();

	await mouseClickToggle();
	await expect
		.poll(async () => dbOpen(), { timeout: 8_000 })
		.toBe(startedOpen);
});
