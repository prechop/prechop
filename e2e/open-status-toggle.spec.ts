import { expect, type Page, test } from "@playwright/test";
import { hash as bcryptHash } from "bcrypt";
import IoRedis from "ioredis";
import mongoose from "mongoose";

// Verifies the vendor dashboard "Open for orders" toggle: clicking it flips the
// kitchen's open state, persists to the backend, and survives a reload. Restores
// the original state at the end so the shared seed is left untouched.

const REDIS_URI = process.env.REDIS_URI ?? "redis://127.0.0.1:6379";
const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27018";
const DB_NAME = process.env.DB_NAME ?? "prechop";
const ORIGIN = "http://localhost:3100";

const VENDOR_PHONE = "08144444444"; // Bola's Buka — seeded ACTIVE vendor
const KNOWN_OTP = "123456";

test.use({ baseURL: ORIGIN });

let redis: IoRedis;
let mongo: mongoose.mongo.MongoClient;

test.beforeAll(async () => {
	redis = new IoRedis(REDIS_URI, { maxRetriesPerRequest: 3 });
	mongo = new mongoose.mongo.MongoClient(MONGODB_URI);
	await mongo.connect();
});
test.afterAll(async () => {
	await redis?.quit();
	await mongo?.close();
});

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

/** Read the vendor's persisted open flag straight from Mongo. */
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
	await loginInBrowser(page, VENDOR_PHONE);
	await page.goto("/dashboard");
	if (new URL(page.url()).pathname.startsWith("/login")) {
		test.skip(
			true,
			"authenticated browser navigation requires a non-secure-cookie dev server",
		);
	}

	const toggle = page.getByRole("switch", {
		name: "Toggle open for orders",
	});
	await expect(toggle).toBeVisible();
	// The switch exposes its on/off state to assistive tech.
	await expect(toggle).toHaveAttribute("aria-checked", /true|false/);

	// A genuine mouse click at the toggle's resting position (scrolled to the top,
	// where it sits below the sticky header — exactly where a real user clicks).
	// This is the interaction the decorative OpenCard::after circle used to
	// swallow; the fix (pointer-events: none) is what lets the click land.
	async function mouseClickToggle() {
		await page.evaluate(() => window.scrollTo(0, 0));
		const box = await toggle.boundingBox();
		if (!box) throw new Error("toggle has no box");
		await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
	}

	const startedOpen = await dbOpen();
	// The card's subtitle reflects the current state (unique copy, unlike the
	// "Closed" order badges elsewhere on the page).
	const openSubtitle = /buyers can order from you right now/i;
	const closedSubtitle = /currently closed for new orders/i;
	await expect(
		page.getByText(startedOpen ? openSubtitle : closedSubtitle),
	).toBeVisible();

	// ── Flip it with a real mouse click ─────────────────────────────────────────
	await mouseClickToggle();
	// It persisted to the backend …
	await expect
		.poll(async () => dbOpen(), { timeout: 8_000 })
		.toBe(!startedOpen);
	// … and the UI reflects the new state.
	await expect(
		page.getByText(startedOpen ? closedSubtitle : openSubtitle),
	).toBeVisible();

	// ── Survives a reload (reads the persisted value back) ──────────────────────
	await page.reload();
	await expect(
		page.getByText(startedOpen ? closedSubtitle : openSubtitle),
	).toBeVisible();

	// ── Restore the original state so the seed is left as we found it ───────────
	await mouseClickToggle();
	await expect
		.poll(async () => dbOpen(), { timeout: 8_000 })
		.toBe(startedOpen);
});
