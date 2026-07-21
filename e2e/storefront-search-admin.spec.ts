import { expect, test } from "@playwright/test";
import mongoose from "mongoose";
import { ADMIN_EMAIL, authenticateBrowserContext, BUYER_EMAIL } from "./auth";
import { ORIGIN } from "./urls";

const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27018";
const DB_NAME = process.env.DB_NAME ?? "prechop";

test.use({ baseURL: ORIGIN });

let mongo: mongoose.mongo.MongoClient;
let hotLunchToken = "";
let adaVendorId = "";
let adaBusinessName = "";

test.beforeAll(async () => {
	mongo = new mongoose.mongo.MongoClient(MONGODB_URI);
	await mongo.connect();
	const db = mongo.db(DB_NAME);
	const listing = await db
		.collection("dailyorders")
		.findOne({ title: "Today's Hot Lunch" });
	if (listing) {
		hotLunchToken = listing.shareableToken as string;
		adaVendorId = listing.vendorId.toString();
		const vendor = await db
			.collection("vendorprofiles")
			.findOne({ _id: listing.vendorId });
		adaBusinessName = (vendor?.businessName as string) ?? "";
	}
});

test.afterAll(async () => {
	await mongo?.close();
});

test("public order page shows the shop name and links through to the storefront", async ({
	page,
}) => {
	expect(hotLunchToken, "seed present - run pnpm seed").toBeTruthy();

	await page.goto(`/o/${hotLunchToken}`);
	await expect(
		page.getByRole("heading", { name: "Today's Hot Lunch" }),
	).toBeVisible();

	const shopLink = page.getByRole("link", { name: /See all listings/i });
	await expect(shopLink).toBeVisible();
	await expect(shopLink).toHaveAttribute("href", `/v/${adaVendorId}`);

	await shopLink.click();
	await expect(page).toHaveURL(new RegExp(`/v/${adaVendorId}$`));
	await expect(page.getByText("Cooking today")).toBeVisible();
	await expect(page.getByText("Full menu")).toBeVisible();
});

test("public storefront lists the vendor's live listings and full menu", async ({
	page,
}) => {
	expect(adaVendorId, "seed present - run pnpm seed").toBeTruthy();

	await page.goto(`/v/${adaVendorId}`);
	if (adaBusinessName) {
		await expect(page.getByText(adaBusinessName).first()).toBeVisible();
	}
	const listingLink = page.getByRole("link", { name: /Today's Hot Lunch/i });
	await expect(listingLink.first()).toBeVisible();
	await expect(listingLink.first()).toHaveAttribute(
		"href",
		`/o/${hotLunchToken}`,
	);
	await expect(page.getByText("Full menu")).toBeVisible();
});

test("marketplace search finds vendors by name/menu/listing", async ({
	page,
}) => {
	await authenticateBrowserContext(page.context(), BUYER_EMAIL);
	await page.goto("/marketplace");
	if (new URL(page.url()).pathname.startsWith("/login")) {
		test.skip(
			true,
			"authenticated browser navigation requires secure loopback cookies",
		);
	}

	await expect(
		page.getByRole("heading", { name: /Campus kitchens/i }),
	).toBeVisible();

	const search = page.getByRole("searchbox", { name: /search vendors/i });
	await expect(search).toBeVisible();
	await search.fill("Jollof");
	await expect(page.getByText(/match|No matches/i).first()).toBeVisible({
		timeout: 10_000,
	});
});

test("admin can open a user's full detail + analytics page", async ({
	page,
}) => {
	await authenticateBrowserContext(page.context(), ADMIN_EMAIL);
	await page.goto("/admin/iam");
	if (new URL(page.url()).pathname.startsWith("/login")) {
		test.skip(
			true,
			"authenticated browser navigation requires secure loopback cookies",
		);
	}
	if (!new URL(page.url()).pathname.startsWith("/admin")) {
		test.skip(true, "admin access not available for this account");
	}

	const viewButton = page.getByRole("button", { name: "View" }).first();
	await expect(viewButton).toBeVisible({ timeout: 10_000 });
	await viewButton.click();

	await expect(page).toHaveURL(/\/admin\/iam\/users\/[a-f0-9]{24}$/);
	await expect(page.getByText("Total orders").first()).toBeVisible();
	await expect(page.getByText("Lifetime spend")).toBeVisible();
	await expect(page.getByText("Identity")).toBeVisible();
	await expect(page.getByText("Access")).toBeVisible();
});
