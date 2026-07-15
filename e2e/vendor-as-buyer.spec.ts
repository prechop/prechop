import { expect, type Page, test } from "@playwright/test";
import { hash as bcryptHash } from "bcrypt";
import IoRedis from "ioredis";
import mongoose from "mongoose";
import { clearOtpGates, otpCodeKey } from "./otpKeys";
import { ORIGIN } from "./urls";

// Browser-driven coverage for the "vendor shops as a buyer" feature. A seller
// can cross into the buyer marketplace via the header mode switcher and order
// from OTHER vendors, but never from their own listing. The server pieces
// (universal buyer permission, self-order guard, marketplace exclusion,
// isOwnListing flag) are unit-tested against real Mongo/Redis; this spec covers
// the client-only pieces that have no other coverage: the Selling/Buying mode
// switcher, the own-listing marketplace exclusion end to end, and the
// "This is your listing" blocked order page.
//
// Auth uses the same OTP-planting-through-the-browser-context technique as
// menu-editor.spec.ts, and the same defensive `/login` skip: it works under the
// dev harness (non-secure cookie) and skips cleanly under the production
// harness (secure `__Host-` cookie makes authenticated page nav impossible).
// Must run against localhost (127.0.0.1 is rejected by the CSRF guard).

const REDIS_URI = process.env.REDIS_URI ?? "redis://127.0.0.1:6379";
const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27018";
const DB_NAME = process.env.DB_NAME ?? "prechop";
// Seeded ACTIVE vendor (Ada's Kitchen) — owns the seeded "Today's Hot Lunch".
const VENDOR_PHONE = "08122222222";
const KNOWN_OTP = "123456";

test.use({ baseURL: ORIGIN });

let redis: IoRedis;
let mongo: mongoose.mongo.MongoClient;
// The seeded vendor's own listing — resolved from Mongo so the spec doesn't
// hard-code a token that reseeding would change.
let ownListingToken: string | null = null;
let ownListingTitle: string | null = null;

test.beforeAll(async () => {
	redis = new IoRedis(REDIS_URI, { maxRetriesPerRequest: 3 });
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
	await redis?.quit();
	await mongo?.close();
});

/** Log in through the browser context so the auth cookie lands in the page. */
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

test("vendor crosses into buying mode and cannot order their own listing", async ({
	page,
}) => {
	await loginInBrowser(page, VENDOR_PHONE);

	// Land on the vendor dashboard. If auth didn't stick we hit /login — that's
	// the secure-cookie prod harness, where authenticated page nav is impossible.
	await page.goto("/dashboard");
	if (new URL(page.url()).pathname.startsWith("/login")) {
		test.skip(
			true,
			"authenticated browser navigation requires a non-secure-cookie dev server",
		);
	}

	// The mode switcher is visible to a vendor, showing "Selling" as active.
	const sellingTab = page.getByRole("tab", { name: /selling/i });
	const buyingTab = page.getByRole("tab", { name: /buying/i });
	await expect(sellingTab).toBeVisible();
	await expect(buyingTab).toBeVisible();
	await expect(sellingTab).toHaveAttribute("aria-selected", "true");

	// Switch to Buying → land in the buyer marketplace with the buyer nav.
	await buyingTab.click();
	await expect(page).toHaveURL(/\/marketplace$/);
	await expect(
		page.getByRole("link", { name: /browse/i }).first(),
	).toBeVisible();
	// Now "Buying" is the active mode.
	await expect(page.getByRole("tab", { name: /buying/i })).toHaveAttribute(
		"aria-selected",
		"true",
	);

	// Their own listing is excluded from their marketplace grid. It is the only
	// active listing on the campus, so the grid shows the empty state and the
	// listing title never appears.
	if (ownListingTitle) {
		await expect(page.getByText(ownListingTitle)).toHaveCount(0);
	}

	// Opening their OWN listing's public order page shows the blocked state —
	// no cart, no checkout — instead of the order form.
	expect(ownListingToken, "seed must have a listing token").toBeTruthy();
	await page.goto(`/o/${ownListingToken}`);
	await expect(
		page.getByRole("heading", { name: /this is your listing/i }),
	).toBeVisible();
	// The checkout affordances are absent on the blocked page.
	await expect(page.getByRole("button", { name: /^Pay /i })).toHaveCount(0);
	await expect(
		page.getByRole("button", { name: /log in to order/i }),
	).toHaveCount(0);
});
