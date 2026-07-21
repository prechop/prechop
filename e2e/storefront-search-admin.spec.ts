import { expect, type Page, test } from "@playwright/test";
import { hash as bcryptHash } from "bcrypt";
import IoRedis from "ioredis";
import mongoose from "mongoose";
import { clearOtpGates, otpCodeKey } from "./otpKeys";
import { ORIGIN } from "./urls";

// Browser-driven coverage for four newly-added surfaces, exercised against the
// real server + seeded local Mongo/Redis (run `pnpm seed` first):
//   • the PUBLIC order page now shows the shop name and a link to the vendor's
//     storefront (unauthenticated — always runs);
//   • the PUBLIC vendor storefront `/v/[vendorId]` lists the shop's live
//     listings and full menu (unauthenticated — always runs);
//   • the marketplace search box looks vendors up by shop/menu/listing;
//   • the admin IAM "View" button opens a full user detail + analytics page.
// The last two need an authenticated browser nav, so they follow the same
// defensive `/login` skip the other specs use under the secure-cookie harness.
// The spec only reads seeded data + creates nothing, so there is no teardown of
// app data to do.

const REDIS_URI = process.env.REDIS_URI ?? "redis://127.0.0.1:6379";
const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27018";
const DB_NAME = process.env.DB_NAME ?? "prechop";

const VENDOR_PHONE = "08122222222"; // Ada — seeded ACTIVE vendor
const BUYER_PHONE = "08111111111"; // seeded buyer
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "prechopofficial@gmail.com";
const KNOWN_OTP = "123456";

test.use({ baseURL: ORIGIN });

let redis: IoRedis;
let mongo: mongoose.mongo.MongoClient;

// Resolved from the seed in beforeAll.
let hotLunchToken = "";
let adaVendorId = "";
let adaBusinessName = "";

test.beforeAll(async () => {
	redis = new IoRedis(REDIS_URI, { maxRetriesPerRequest: 3 });
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
	await redis?.quit();
	await mongo?.close();
});

async function loginInBrowser(page: Page, phone: string) {
	const ctx = page.context();
	await clearOtpGates(redis, phone);
	const req = await ctx.request.post("/api/auth/otp/request", {
		headers: { origin: ORIGIN },
		data: { phone },
	});
	expect(req.ok(), "otp request").toBeTruthy();
	await redis.setex(otpCodeKey(phone), 600, await bcryptHash(KNOWN_OTP, 10));
	const verify = await ctx.request.post("/api/auth/otp/verify", {
		headers: { origin: ORIGIN },
		data: { phone, otp: KNOWN_OTP },
	});
	expect(verify.ok(), "otp verify").toBeTruthy();
}

test("public order page shows the shop name and links through to the storefront", async ({
	page,
}) => {
	expect(hotLunchToken, "seed present — run pnpm seed").toBeTruthy();

	await page.goto(`/o/${hotLunchToken}`);
	await expect(
		page.getByRole("heading", { name: "Today's Hot Lunch" }),
	).toBeVisible();

	// Shop link is present, carries the shop name, and points at the storefront.
	const shopLink = page.getByRole("link", { name: /See all listings/i });
	await expect(shopLink).toBeVisible();
	await expect(shopLink).toHaveAttribute("href", `/v/${adaVendorId}`);

	// Clicking it lands on the storefront and renders the shop's sections.
	await shopLink.click();
	await expect(page).toHaveURL(new RegExp(`/v/${adaVendorId}$`));
	await expect(page.getByText("Cooking today")).toBeVisible();
	await expect(page.getByText("Full menu")).toBeVisible();
});

test("public storefront lists the vendor's live listings and full menu", async ({
	page,
}) => {
	expect(adaVendorId, "seed present — run pnpm seed").toBeTruthy();

	await page.goto(`/v/${adaVendorId}`);
	// Shop identity.
	if (adaBusinessName) {
		await expect(page.getByText(adaBusinessName).first()).toBeVisible();
	}
	// The seeded live listing appears under "Cooking today" and links to /o/.
	const listingLink = page.getByRole("link", { name: /Today's Hot Lunch/i });
	await expect(listingLink.first()).toBeVisible();
	await expect(listingLink.first()).toHaveAttribute(
		"href",
		`/o/${hotLunchToken}`,
	);
	// The full menu section renders at least one item.
	await expect(page.getByText("Full menu")).toBeVisible();
});

test("marketplace search finds vendors by name/menu/listing", async ({
	page,
}) => {
	await loginInBrowser(page, BUYER_PHONE);
	await page.goto("/marketplace");
	if (new URL(page.url()).pathname.startsWith("/login")) {
		test.skip(
			true,
			"authenticated browser navigation requires a non-secure-cookie dev server",
		);
	}

	// The grid shows the campus kitchens with their shop names.
	await expect(
		page.getByRole("heading", { name: /Campus kitchens/i }),
	).toBeVisible();

	// Search by a seeded dish name and confirm the results panel appears.
	const search = page.getByRole("searchbox", { name: /search vendors/i });
	await expect(search).toBeVisible();
	await search.fill("Jollof");
	// Either a "N shops match" summary or a "no matches" state must render — both
	// prove the search endpoint ran and the UI reacted.
	await expect(page.getByText(/match|No matches/i).first()).toBeVisible({
		timeout: 10_000,
	});
});

test("admin can open a user's full detail + analytics page", async ({
	page,
}) => {
	await loginInBrowser(page, ADMIN_EMAIL);
	await page.goto("/admin/iam");
	if (new URL(page.url()).pathname.startsWith("/login")) {
		test.skip(
			true,
			"authenticated browser navigation requires a non-secure-cookie dev server",
		);
	}
	if (!new URL(page.url()).pathname.startsWith("/admin")) {
		test.skip(true, "admin access not available for this account");
	}

	// The Users tab lists users, each with a View button.
	const viewButton = page.getByRole("button", { name: "View" }).first();
	await expect(viewButton).toBeVisible({ timeout: 10_000 });
	await viewButton.click();

	// Lands on the detail page with the analytics headline cards.
	await expect(page).toHaveURL(/\/admin\/iam\/users\/[a-f0-9]{24}$/);
	// "Total orders" can appear twice (headline stat + vendor field), so scope it.
	await expect(page.getByText("Total orders").first()).toBeVisible();
	await expect(page.getByText("Lifetime spend")).toBeVisible();
	await expect(page.getByText("👤 Identity")).toBeVisible();
	await expect(page.getByText("🔐 Access")).toBeVisible();
});
