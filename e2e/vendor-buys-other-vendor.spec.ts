import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import mongoose from "mongoose";
import { authenticateBrowserContext, VENDOR_EMAIL } from "./auth";
import { ORIGIN } from "./urls";

const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27018";
const DB_NAME = process.env.DB_NAME ?? "prechop";

test.use({ baseURL: ORIGIN });

let mongo: mongoose.mongo.MongoClient;

const STAMP = process.env.E2E_STAMP ?? String(process.pid);
const OTHER_TITLE = `E2E Other Listing ${STAMP}`;
let otherVendorId: mongoose.mongo.BSON.ObjectId | null = null;
let otherListingId: mongoose.mongo.BSON.ObjectId | null = null;
let otherToken: string | null = null;

const ObjectId = mongoose.mongo.ObjectId;

test.beforeAll(async () => {
	mongo = new mongoose.mongo.MongoClient(MONGODB_URI);
	await mongo.connect();
	const db = mongo.db(DB_NAME);

	const ada = await db
		.collection("vendorprofiles")
		.findOne({ businessName: "Ada's Kitchen" });
	const seedListing = await db
		.collection("dailyorders")
		.findOne({ title: "Today's Hot Lunch" });
	if (!ada || !seedListing) return;

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
		availableFrom: null,
		cutoffTime: new Date(now + 2 * 60 * 60 * 1000),
		deleted: false,
		items: (seedListing.items as Array<Record<string, unknown>>).map(
			(it) => ({
				...it,
				_id: new ObjectId(),
				orderedQuantity: 0,
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
	await mongo?.close();
});

test("a vendor switches to buying and can order another vendor's listing", async ({
	page,
}) => {
	expect(otherToken, "cloned listing must exist (seed present)").toBeTruthy();

	await authenticateBrowserContext(page.context(), VENDOR_EMAIL);
	await page.goto("/dashboard");
	if (new URL(page.url()).pathname.startsWith("/login")) {
		test.skip(
			true,
			"authenticated browser navigation requires secure loopback cookies",
		);
	}

	await page.getByRole("tab", { name: /buying/i }).click();
	await expect(page).toHaveURL(/\/marketplace$/);
	await expect(page.getByRole("tab", { name: /buying/i })).toHaveAttribute(
		"aria-selected",
		"true",
	);

	await page.goto(`/o/${otherToken}`);
	await expect(
		page.getByRole("heading", { name: OTHER_TITLE }),
	).toBeVisible();
	await expect(
		page.getByRole("heading", { name: /this is your listing/i }),
	).toHaveCount(0);
	await expect(
		page.getByRole("button", { name: /log in to order/i }),
	).toHaveCount(0);

	await page
		.getByRole("button", { name: /^Add one / })
		.first()
		.click();
	const payButton = page.getByRole("button", { name: /^Pay / });
	await expect(payButton).toBeVisible();
	await expect(payButton).toBeEnabled();
});
