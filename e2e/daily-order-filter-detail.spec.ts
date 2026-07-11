import { expect, type Page, test } from "@playwright/test";
import { hash as bcryptHash } from "bcrypt";
import IoRedis from "ioredis";
import mongoose from "mongoose";

// Browser-driven coverage for the vendor daily-order filter + detail + edit-lock
// feature. It drives the real UI end to end:
//   • the dashboard list filter (search by title, status chips) queries the
//     backend and changes which listings render;
//   • a listing's dedicated detail page shows its config, items, share link and
//     a QR, and gates the Edit affordance on the orders-open lock;
//   • an editable (not-yet-open) listing exposes "Edit daily order" and reaches
//     the composer; a listing whose orders have opened is view-only.
//
// It creates its own listings through the vendor API (so it controls titles and
// the open time that drives the lock) and deletes them in afterAll, leaving the
// seeded data untouched. Auth uses the same OTP-planting-through-the-browser
// technique as the other specs, with the same defensive `/login` skip so the
// committed suite stays green under the secure-cookie production harness.

const REDIS_URI = process.env.REDIS_URI ?? "redis://127.0.0.1:6379";
const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27018";
const DB_NAME = process.env.DB_NAME ?? "prechop";
// Seeded ACTIVE vendor (Ada's Kitchen) — owns the seeded "Today's Hot Lunch".
const VENDOR_PHONE = "08122222222";
const KNOWN_OTP = "123456";
const ORIGIN = "http://localhost:3100";

test.use({ baseURL: ORIGIN });

let redis: IoRedis;
let mongo: mongoose.mongo.MongoClient;

// Unique per-run titles so parallel/rerun invocations never collide, and so
// cleanup only ever removes what this run created.
const STAMP = process.env.E2E_STAMP ?? String(process.pid);
const SOON_TITLE = `E2E Soon ${STAMP}`;
const DRAFT_TITLE = `E2E Draft ${STAMP}`;

test.beforeAll(async () => {
	redis = new IoRedis(REDIS_URI, { maxRetriesPerRequest: 3 });
	mongo = new mongoose.mongo.MongoClient(MONGODB_URI);
	await mongo.connect();
});

test.afterAll(async () => {
	// Remove only the throwaway listings this spec created, whatever state the
	// run reached — leave the seeded data intact.
	await mongo
		.db(DB_NAME)
		.collection("dailyorders")
		.deleteMany({ title: { $in: [SOON_TITLE, DRAFT_TITLE] } });
	await redis?.quit();
	await mongo?.close();
});

/** Log in through the browser context so the auth cookie lands in the page. */
async function loginInBrowser(page: Page, phone: string) {
	const ctx = page.context();
	await redis.del(`otp:ratelimit:${phone}`);
	const req = await ctx.request.post("/api/auth/otp/request", {
		headers: { origin: ORIGIN },
		data: { phone },
	});
	expect(req.ok(), "otp request").toBeTruthy();
	await redis.setex(
		`otp:code:${phone}`,
		600,
		await bcryptHash(KNOWN_OTP, 10),
	);
	const verify = await ctx.request.post("/api/auth/otp/verify", {
		headers: { origin: ORIGIN },
		data: { phone, otp: KNOWN_OTP },
	});
	expect(verify.ok(), "otp verify").toBeTruthy();
}

/** Create a daily order via the vendor API; returns nothing (asserts success). */
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

	// A menu item to hang the listings off of (the vendor owns their own menu).
	const menuRes = await page.context().request.get("/api/menu", {
		headers: { origin: ORIGIN },
	});
	expect(menuRes.ok(), "load menu").toBeTruthy();
	const menu = (await menuRes.json()).data as Array<{ id: string }>;
	expect(menu.length, "vendor has menu items").toBeGreaterThan(0);
	const menuItemId = menu[0].id;

	const now = Date.now();
	const iso = (ms: number) => new Date(now + ms).toISOString();

	// Editable listing: ACTIVE but opens in 1h → still inside the edit window.
	await createListing(page, {
		title: SOON_TITLE,
		scheduledDate: iso(0),
		availableFrom: iso(60 * 60 * 1000),
		cutoffTime: iso(2 * 60 * 60 * 1000),
		draft: false,
		items: [{ menuItemId }],
	});
	// A DRAFT listing, so the status filter has something distinct to select.
	await createListing(page, {
		title: DRAFT_TITLE,
		scheduledDate: iso(0),
		availableFrom: iso(60 * 60 * 1000),
		cutoffTime: iso(2 * 60 * 60 * 1000),
		draft: true,
		items: [{ menuItemId }],
	});

	// ── Reads integrate: both new listings show alongside the seeded one ──────
	await page.reload();
	await expect(page.getByRole("link", { name: SOON_TITLE })).toBeVisible();
	await expect(page.getByRole("link", { name: DRAFT_TITLE })).toBeVisible();
	await expect(page.getByText("Today's Hot Lunch")).toBeVisible();

	// ── Filter: search by title queries the backend and narrows the list ──────
	const searchBox = page.getByRole("searchbox");
	await searchBox.fill("E2E Soon");
	await expect(page.getByRole("link", { name: SOON_TITLE })).toBeVisible();
	await expect(page.getByRole("link", { name: DRAFT_TITLE })).toHaveCount(0);
	await expect(page.getByText("Today's Hot Lunch")).toHaveCount(0);
	await searchBox.fill("");

	// ── Filter: the Draft status chip shows only DRAFT listings ───────────────
	await page.getByRole("button", { name: "Draft", exact: true }).click();
	await expect(page.getByRole("link", { name: DRAFT_TITLE })).toBeVisible();
	await expect(page.getByRole("link", { name: SOON_TITLE })).toHaveCount(0);
	await expect(page.getByText("Today's Hot Lunch")).toHaveCount(0);
	// Back to all.
	await page.getByRole("button", { name: "All", exact: true }).click();

	// ── Detail page: open the editable listing ────────────────────────────────
	await page.getByRole("link", { name: SOON_TITLE }).click();
	await expect(page).toHaveURL(/\/dashboard\/[a-f0-9]{24}$/);
	await expect(page.getByRole("heading", { name: SOON_TITLE })).toBeVisible();
	// Sections render.
	await expect(page.getByText("Listing configuration")).toBeVisible();
	await expect(page.getByText("Items & progress")).toBeVisible();
	await expect(page.getByText("Share this listing")).toBeVisible();
	// Share link points at the public listing.
	await expect(page.getByText(/\/o\//)).toBeVisible();

	// Editable → the Edit affordance is present and reaches the composer.
	const editButton = page.getByRole("button", {
		name: /edit daily order/i,
	});
	await expect(editButton).toBeVisible();
	await editButton.click();
	await expect(page).toHaveURL(/\/dashboard\/[a-f0-9]{24}\/edit$/);
	await expect(
		page.getByRole("heading", { name: /edit daily order/i }),
	).toBeVisible();

	// ── Edit-lock: the seeded listing has already opened → view only ──────────
	await page.goto("/dashboard");
	await page.getByRole("link", { name: "Today's Hot Lunch" }).click();
	await expect(page).toHaveURL(/\/dashboard\/[a-f0-9]{24}$/);
	await expect(
		page.getByRole("heading", { name: "Today's Hot Lunch" }),
	).toBeVisible();
	// View-only note is shown and there is no Edit affordance.
	await expect(page.getByText(/view only/i)).toBeVisible();
	await expect(
		page.getByRole("button", { name: /edit daily order/i }),
	).toHaveCount(0);
});
