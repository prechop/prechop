import { expect, type Page, test } from "@playwright/test";
import mongoose from "mongoose";
import { authenticateBrowserContext, VENDOR_EMAIL } from "./auth";
import { ORIGIN } from "./urls";

const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27018";
const DB_NAME = process.env.DB_NAME ?? "prechop";

test.use({ baseURL: ORIGIN });

let mongo: mongoose.mongo.MongoClient;

const STAMP = process.env.E2E_STAMP ?? String(process.pid);
const SOON_TITLE = `E2E Soon ${STAMP}`;
const DRAFT_TITLE = `E2E Draft ${STAMP}`;

test.beforeAll(async () => {
	mongo = new mongoose.mongo.MongoClient(MONGODB_URI);
	await mongo.connect();
});

test.afterAll(async () => {
	await mongo
		.db(DB_NAME)
		.collection("dailyorders")
		.deleteMany({ title: { $in: [SOON_TITLE, DRAFT_TITLE] } });
	await mongo?.close();
});

async function createListing(
	page: Page,
	body: Record<string, unknown>,
): Promise<void> {
	const res = await page.context().request.post("/api/daily-orders", {
		headers: { origin: ORIGIN },
		data: body,
	});
	expect(res.ok(), `create listing "${body.title}"`).toBeTruthy();
}

test("filters the dashboard, opens a detail page, and gates editing on the open time", async ({
	page,
}) => {
	await authenticateBrowserContext(page.context(), VENDOR_EMAIL);
	await page.goto("/dashboard");
	if (new URL(page.url()).pathname.startsWith("/login")) {
		test.skip(
			true,
			"authenticated browser navigation requires secure loopback cookies",
		);
	}

	const menuRes = await page.context().request.get("/api/menu", {
		headers: { origin: ORIGIN },
	});
	expect(menuRes.ok(), "load menu").toBeTruthy();
	const menu = (await menuRes.json()).data as Array<{ id: string }>;
	expect(menu.length, "vendor has menu items").toBeGreaterThan(0);
	const menuItemId = menu[0].id;

	const now = Date.now();
	const iso = (ms: number) => new Date(now + ms).toISOString();

	await createListing(page, {
		title: SOON_TITLE,
		scheduledDate: iso(0),
		availableFrom: iso(60 * 60 * 1000),
		cutoffTime: iso(2 * 60 * 60 * 1000),
		draft: false,
		items: [{ menuItemId }],
	});
	await createListing(page, {
		title: DRAFT_TITLE,
		scheduledDate: iso(0),
		availableFrom: iso(60 * 60 * 1000),
		cutoffTime: iso(2 * 60 * 60 * 1000),
		draft: true,
		items: [{ menuItemId }],
	});

	await page.reload();
	await expect(page.getByRole("link", { name: SOON_TITLE })).toBeVisible();
	await expect(page.getByRole("link", { name: DRAFT_TITLE })).toBeVisible();
	await expect(page.getByText("Today's Hot Lunch")).toBeVisible();

	const searchBox = page.getByRole("searchbox");
	await searchBox.fill("E2E Soon");
	await expect(page.getByRole("link", { name: SOON_TITLE })).toBeVisible();
	await expect(page.getByRole("link", { name: DRAFT_TITLE })).toHaveCount(0);
	await expect(page.getByText("Today's Hot Lunch")).toHaveCount(0);
	await searchBox.fill("");

	await page.getByRole("button", { name: "Draft", exact: true }).click();
	await expect(page.getByRole("link", { name: DRAFT_TITLE })).toBeVisible();
	await expect(page.getByRole("link", { name: SOON_TITLE })).toHaveCount(0);
	await expect(page.getByText("Today's Hot Lunch")).toHaveCount(0);
	await page.getByRole("button", { name: "All", exact: true }).click();

	await page.getByRole("link", { name: SOON_TITLE }).click();
	await expect(page).toHaveURL(/\/dashboard\/[a-f0-9]{24}$/);
	await expect(page.getByRole("heading", { name: SOON_TITLE })).toBeVisible();
	await expect(page.getByText("Listing configuration")).toBeVisible();
	await expect(page.getByText("Items & progress")).toBeVisible();
	await expect(page.getByText("Share this listing")).toBeVisible();
	await expect(page.getByText(/\/o\//)).toBeVisible();

	const editButton = page.getByRole("button", {
		name: /edit daily order/i,
	});
	await expect(editButton).toBeVisible();
	await editButton.click();
	await expect(page).toHaveURL(/\/dashboard\/[a-f0-9]{24}\/edit$/);
	await expect(
		page.getByRole("heading", { name: /edit daily order/i }),
	).toBeVisible();

	await page.goto("/dashboard");
	await page.getByRole("link", { name: "Today's Hot Lunch" }).click();
	await expect(page).toHaveURL(/\/dashboard\/[a-f0-9]{24}$/);
	await expect(
		page.getByRole("heading", { name: "Today's Hot Lunch" }),
	).toBeVisible();
	await expect(page.getByText(/view only/i)).toBeVisible();
	await expect(
		page.getByRole("button", { name: /edit daily order/i }),
	).toHaveCount(0);
});
