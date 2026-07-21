import { expect, test } from "@playwright/test";
import mongoose from "mongoose";
import { authenticateBrowserContext, VENDOR_EMAIL } from "./auth";
import { ORIGIN } from "./urls";

const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27018";
const DB_NAME = process.env.DB_NAME ?? "prechop";

test.use({ baseURL: ORIGIN });

let mongo: mongoose.mongo.MongoClient;
let ownListingToken: string | null = null;
let ownListingTitle: string | null = null;

test.beforeAll(async () => {
	mongo = new mongoose.mongo.MongoClient(MONGODB_URI);
	await mongo.connect();
	const listing = await mongo
		.db(DB_NAME)
		.collection("dailyorders")
		.findOne({ title: /Hot Lunch/ });
	ownListingToken = (listing?.shareableToken as string) ?? null;
	ownListingTitle = (listing?.title as string) ?? null;
});

test.afterAll(async () => {
	await mongo?.close();
});

test("vendor crosses into buying mode and cannot order their own listing", async ({
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

	const sellingTab = page.getByRole("tab", { name: /selling/i });
	const buyingTab = page.getByRole("tab", { name: /buying/i });
	await expect(sellingTab).toBeVisible();
	await expect(buyingTab).toBeVisible();
	await expect(sellingTab).toHaveAttribute("aria-selected", "true");

	await buyingTab.click();
	await expect(page).toHaveURL(/\/marketplace$/);
	await expect(
		page.getByRole("link", { name: /browse/i }).first(),
	).toBeVisible();
	await expect(page.getByRole("tab", { name: /buying/i })).toHaveAttribute(
		"aria-selected",
		"true",
	);

	if (ownListingTitle) {
		await expect(page.getByText(ownListingTitle)).toHaveCount(0);
	}

	expect(ownListingToken, "seed must have a listing token").toBeTruthy();
	await page.goto(`/o/${ownListingToken}`);
	await expect(
		page.getByRole("heading", { name: /this is your listing/i }),
	).toBeVisible();
	await expect(page.getByRole("button", { name: /^Pay /i })).toHaveCount(0);
	await expect(
		page.getByRole("button", { name: /log in to order/i }),
	).toHaveCount(0);
});
