import { randomBytes } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { hash as bcryptHash } from "bcrypt";
import IoRedis from "ioredis";
import mongoose from "mongoose";
import { clearOtpGates, otpCodeKey } from "./otpKeys";
import { ORIGIN } from "./urls";

// Browser-driven proof that a vendor who switches into buying mode CAN order
// from ANOTHER vendor's listing (the positive counterpart to vendor-as-buyer's
// own-listing block). The self-order guard, universal buyer permission and the
// actual paid placeOrder path are unit-tested against real Mongo/Redis with a
// mocked Paystack (see tests/services/vendorAsBuyer.test.ts — "lets a vendor buy
// from ANOTHER vendor's listing"); this spec covers the client path that has no
// other coverage: the Selling→Buying switch, and that a different vendor's
// listing renders the live order form (not the "this is your listing" block)
// with an enabled checkout button.
//
// A real payment can't complete against the e2e server (Paystack keys are
// deliberately fake), so this stops at the enabled "Pay" button rather than a
// created order — the payment execution is what the mocked service test covers.
//
// It stands up a SECOND active vendor + a fresh listing by cloning the seeded
// vendor/listing documents (distinct userId, so it is not Ada's own), and tears
// everything it inserted back out in afterAll — the seed data is left untouched.

const REDIS_URI = process.env.REDIS_URI ?? "redis://127.0.0.1:6379";
const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27018";
const DB_NAME = process.env.DB_NAME ?? "prechop";
// Seeded ACTIVE vendor (Ada's Kitchen) — she switches to buying and orders the
// cloned "other" vendor's listing.
const VENDOR_PHONE = "08122222222";
const KNOWN_OTP = "123456";

test.use({ baseURL: ORIGIN });

let redis: IoRedis;
let mongo: mongoose.mongo.MongoClient;

const STAMP = process.env.E2E_STAMP ?? String(process.pid);
const OTHER_TITLE = `E2E Other Listing ${STAMP}`;
let otherVendorId: mongoose.mongo.BSON.ObjectId | null = null;
let otherListingId: mongoose.mongo.BSON.ObjectId | null = null;
let otherToken: string | null = null;

const ObjectId = mongoose.mongo.ObjectId;

test.beforeAll(async () => {
	redis = new IoRedis(REDIS_URI, { maxRetriesPerRequest: 3 });
	mongo = new mongoose.mongo.MongoClient(MONGODB_URI);
	await mongo.connect();
	const db = mongo.db(DB_NAME);

	// Clone the seeded vendor + listing so the "other" vendor is schema-complete
	// but owned by a DIFFERENT user (so Ada is not flagged as the owner).
	const ada = await db
		.collection("vendorprofiles")
		.findOne({ businessName: "Ada's Kitchen" });
	const seedListing = await db
		.collection("dailyorders")
		.findOne({ title: "Today's Hot Lunch" });
	if (!ada || !seedListing) return; // beforeAll leaves ids null → test skips.

	otherVendorId = new ObjectId();
	const otherUserId = new ObjectId();
	const { _id: _adaId, ...adaRest } = ada;
	await db.collection("vendorprofiles").insertOne({
		...adaRest,
		_id: otherVendorId,
		userId: otherUserId,
		businessName: `E2E Other Kitchen ${STAMP}`,
		email: `e2e-other-${STAMP}@prechop.test`,
		status: "ACTIVE",
		isOpenForOrders: true,
	});

	otherListingId = new ObjectId();
	otherToken = randomBytes(9).toString("hex");
	const now = Date.now();
	const { _id: _listId, ...listRest } = seedListing;
	await db.collection("dailyorders").insertOne({
		...listRest,
		_id: otherListingId,
		vendorId: otherVendorId,
		title: OTHER_TITLE,
		shareableToken: otherToken,
		status: "ACTIVE",
		scheduledDate: new Date(now),
		availableFrom: null, // opens immediately → orderable now
		cutoffTime: new Date(now + 2 * 60 * 60 * 1000),
		deleted: false,
		items: (seedListing.items as Array<Record<string, unknown>>).map(
			(it) => ({
				...it,
				_id: new ObjectId(),
				orderedQuantity: 0,
				// Drop option groups so checkout has no required selections to
				// satisfy — the point here is that the order form is reachable.
				optionGroups: [],
			}),
		),
	});
});

test.afterAll(async () => {
	const db = mongo?.db(DB_NAME);
	if (db) {
		if (otherListingId)
			await db
				.collection("dailyorders")
				.deleteOne({ _id: otherListingId });
		if (otherVendorId)
			await db
				.collection("vendorprofiles")
				.deleteOne({ _id: otherVendorId });
	}
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

test("a vendor switches to buying and can order another vendor's listing", async ({
	page,
}) => {
	expect(otherToken, "cloned listing must exist (seed present)").toBeTruthy();

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

	// Switch Selling → Buying via the header mode switcher.
	await page.getByRole("tab", { name: /buying/i }).click();
	await expect(page).toHaveURL(/\/marketplace$/);
	await expect(page.getByRole("tab", { name: /buying/i })).toHaveAttribute(
		"aria-selected",
		"true",
	);

	// Open the OTHER vendor's listing. Because it is not Ada's, the live order
	// form renders — NOT the "This is your listing" block.
	await page.goto(`/o/${otherToken}`);
	await expect(
		page.getByRole("heading", { name: OTHER_TITLE }),
	).toBeVisible();
	await expect(
		page.getByRole("heading", { name: /this is your listing/i }),
	).toHaveCount(0);
	// She is authenticated, so checkout is not gated behind "log in to order".
	await expect(
		page.getByRole("button", { name: /log in to order/i }),
	).toHaveCount(0);

	// Add an item → checkout becomes an enabled "Pay ₦… →" (order is placeable).
	// The control renders a "＋" glyph but carries aria-label="Add one {item}",
	// and an aria-label WINS over text content when computing the accessible
	// name — so matching on the glyph never finds it. Matching the label is also
	// the more honest assertion: it is what a screen-reader user hears.
	await page
		.getByRole("button", { name: /^Add one / })
		.first()
		.click();
	const payButton = page.getByRole("button", { name: /^Pay ₦/ });
	await expect(payButton).toBeVisible();
	await expect(payButton).toBeEnabled();
});
