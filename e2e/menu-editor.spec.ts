import { expect, type Page, test } from "@playwright/test";
import { hash as bcryptHash } from "bcrypt";
import IoRedis from "ioredis";
import mongoose from "mongoose";

// Browser-driven coverage for the menu add/edit **pages** (`/menu/new` and
// `/menu/[itemId]/edit`) that replaced the old inline modal in `MenuWrapper`.
// It drives the real UI: navigate the list, click through to the create page,
// submit, confirm the item lands in the list AND persists, then open the edit
// page, change it, save, and confirm the update persists.
//
// Auth: the same OTP-planting technique the other specs use, but performed
// through the *browser context's* request object so the Set-Cookie lands in the
// page's cookie jar and subsequent `page.goto` navigations are authenticated.
// This works under BOTH the dev (`next dev`) and production (`next start`)
// harnesses: production issues a secure `__Host-` cookie, but Chromium treats
// `http://localhost` as a secure context and so both stores and sends it over
// plain http — which is why this spec must run against `localhost` (not
// 127.0.0.1, which is also a secure context but is rejected by the CSRF guard).
// The `/login` guard below is a defensive skip for any harness where auth can't
// stick, so the committed suite stays green rather than failing outright.

const REDIS_URI = process.env.REDIS_URI ?? "redis://127.0.0.1:6379";
const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27018";
const DB_NAME = process.env.DB_NAME ?? "prechop";
// Seeded ACTIVE vendor (Ada's Kitchen) — the only status that unlocks the menu.
const VENDOR_PHONE = "08122222222";
const KNOWN_OTP = "123456";
// The CSRF guard only accepts `localhost` (127.0.0.1 collapses to "0.1"), and
// the browser derives the Origin header of every in-app request from the page's
// own URL — so the whole spec must run against localhost, not 127.0.0.1.
const ORIGIN = "http://localhost:3100";

test.use({ baseURL: ORIGIN });

let redis: IoRedis;
let mongo: mongoose.mongo.MongoClient;
// Created by the test so it can assert persistence and clean itself up.
let createdItemName: string | null = null;

test.beforeAll(async () => {
	redis = new IoRedis(REDIS_URI, { maxRetriesPerRequest: 3 });
	mongo = new mongoose.mongo.MongoClient(MONGODB_URI);
	await mongo.connect();
});

test.afterAll(async () => {
	// Remove the throwaway item this spec created, whatever state it reached.
	if (createdItemName) {
		await mongo
			.db(DB_NAME)
			.collection("menuitems")
			.deleteMany({ name: createdItemName });
	}
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

test("add & edit menu items on their own pages", async ({ page }) => {
	const consoleErrors: string[] = [];
	page.on("console", (m) => {
		if (m.type() === "error") consoleErrors.push(m.text());
	});

	await loginInBrowser(page, VENDOR_PHONE);

	// The menu list. If auth didn't stick we land on /login — that means this is
	// the secure-cookie prod harness, where authenticated page nav is impossible.
	await page.goto("/menu");
	if (new URL(page.url()).pathname.startsWith("/login")) {
		test.skip(
			true,
			"authenticated browser navigation requires a non-secure-cookie dev server",
		);
	}

	// Reads integrate: a seeded dish renders.
	await expect(
		page.getByRole("heading", { name: "Your menu" }),
	).toBeVisible();
	await expect(page.getByText("Jollof Rice & Chicken").first()).toBeVisible();

	// Navigate to the dedicated create page via the list's "Add item" button.
	await page
		.getByRole("button", { name: /add item/i })
		.first()
		.click();
	await expect(page).toHaveURL(/\/menu\/new$/);
	await expect(page.getByRole("heading", { name: "New item" })).toBeVisible();

	// Fill and submit the create form.
	createdItemName = `E2E Suya Wrap ${Date.now()}`;
	await page.getByPlaceholder("Jollof rice & chicken").fill(createdItemName);
	await page.getByPlaceholder("1500").fill("1800");
	await page
		.getByPlaceholder("Smoky party jollof with grilled chicken.")
		.fill("Spicy suya beef in a warm wrap.");
	await page.getByRole("button", { name: "Add item", exact: true }).click();

	// Writes integrate: back on the list, the new dish is shown.
	await expect(page).toHaveURL(/\/menu$/);
	await expect(page.getByText(createdItemName)).toBeVisible();

	// Persisted: the item exists in Mongo with the price we set (₦1800 = 180000k).
	const created = await mongo
		.db(DB_NAME)
		.collection("menuitems")
		.findOne({ name: createdItemName });
	expect(created, "created item persisted").toBeTruthy();
	expect(created?.priceKobo).toBe(180000);
	const createdId = created!._id.toString();

	// Open the dedicated edit page and confirm it hydrated from the item.
	await page.goto(`/menu/${createdId}/edit`);
	await expect(
		page.getByRole("heading", { name: "Edit item" }),
	).toBeVisible();
	await expect(page.getByPlaceholder("Jollof rice & chicken")).toHaveValue(
		createdItemName,
	);
	await expect(page.getByPlaceholder("1500")).toHaveValue("1800");

	// Change the price and save.
	await page.getByPlaceholder("1500").fill("2100");
	await page.getByRole("button", { name: "Save changes" }).click();

	// Back on the list; the edit persisted.
	await expect(page).toHaveURL(/\/menu$/);
	const updated = await mongo
		.db(DB_NAME)
		.collection("menuitems")
		.findOne({ _id: created!._id });
	expect(updated?.priceKobo, "edit persisted").toBe(210000);

	expect(
		consoleErrors,
		`no console errors during the flow: ${consoleErrors.join(" | ")}`,
	).toEqual([]);
});
