import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import wait from "@/server/constants/wait";
import {
	acquireLock,
	Redis,
	redisDeleteKeys,
	redisRetrieveKeyString,
	redisUpdateKeyString,
	releaseLock,
} from "@/server/databases/redis";
import { DayOfWeek, MenuCategory } from "@/server/models/enums";
import { upsertPushSubscriptionDB } from "@/server/models/pushSubscriptions";
import { sendPush } from "@/server/providers/push";
import { createMenuItem } from "@/server/services/menu/createMenu";
import {
	confirmMenuItemImage,
	presignMenuItemImage,
} from "@/server/services/menu/image";
import { createUserNotification } from "@/server/services/notifications/createUserNotification";
import { getUnreadCount } from "@/server/services/notifications/listNotifications";
import { getVapidPublicKey, subscribePush } from "@/server/services/push";
import {
	getTimetable,
	getTimetableForDay,
	getTodayTemplate,
	todayDayOfWeek,
} from "@/server/services/timetable/queries";
import { upsertTimetableEntry } from "@/server/services/timetable/upsertEntry";
import { connectTestDB, dropAndDisconnect, oid } from "../helpers/db";
import { makeMenuItem, makeVendor } from "../helpers/factories";

const keys = new Set<string>();

beforeAll(async () => {
	await connectTestDB();
});

afterEach(async () => {
	if (keys.size) {
		await Redis.del(...keys);
		keys.clear();
	}
});

afterAll(async () => {
	await dropAndDisconnect();
});

describe("wait", () => {
	it("resolves after the given delay", async () => {
		const start = Date.now();
		await wait(10);
		expect(Date.now() - start).toBeGreaterThanOrEqual(8);
	});
});

describe("redis helpers", () => {
	it("set/get/delete a JSON value", async () => {
		const k = `vitest:redis:${oid()}`;
		keys.add(k);
		expect(await redisUpdateKeyString(k, { a: 1 }, true, 60)).toBe(true);
		expect(await redisRetrieveKeyString<{ a: number }>(k)).toEqual({
			a: 1,
		});
		expect(await redisDeleteKeys(k)).toBe(true);
		expect(await redisRetrieveKeyString(k)).toBeUndefined();
	});

	it("set without expiry", async () => {
		const k = `vitest:redis:${oid()}`;
		keys.add(k);
		expect(await redisUpdateKeyString(k, "x", false)).toBe(true);
	});

	it("acquireLock is single-owner and releaseLock frees it", async () => {
		const k = `vitest:lock:${oid()}`;
		keys.add(k);
		expect(await acquireLock(k, "owner1", 60)).toBe(true);
		expect(await acquireLock(k, "owner2", 60)).toBe(false);
		await releaseLock(k, "owner-wrong"); // does not own → no-op
		expect(await acquireLock(k, "owner3", 60)).toBe(false);
		await releaseLock(k, "owner1"); // owner frees it
		expect(await acquireLock(k, "owner4", 60)).toBe(true);
	});

	it("redisDeleteKeys returns false for no keys", async () => {
		expect(await redisDeleteKeys()).toBe(false);
	});
});

describe("push service + provider", () => {
	it("returns the (empty) VAPID public key in test env", () => {
		expect(getVapidPublicKey()).toEqual({ publicKey: "" });
	});

	it("subscribePush upserts a subscription", async () => {
		const userId = oid();
		const sub = await subscribePush({
			userId,
			endpoint: `https://push.test/${oid()}`,
			keys: { p256dh: "k", auth: "a" },
		});
		expect(sub!.userId.toString()).toBe(userId);
	});

	it("sendPush returns not-ok when VAPID is unconfigured (no network)", async () => {
		const res = await sendPush(
			{
				endpoint: "https://push.test/x",
				keys: { p256dh: "k", auth: "a" },
			},
			{ title: "hi" },
		);
		expect(res.ok).toBe(false);
		expect(res.gone).toBe(false);
	});

	it("createUserNotification fans out to a subscription without throwing", async () => {
		const userId = oid();
		await upsertPushSubscriptionDB({
			userId,
			endpoint: `https://push.test/${oid()}`,
			keys: { p256dh: "k", auth: "a" },
		});
		await expect(
			createUserNotification({
				userId,
				title: "Hi",
				body: "There",
				type: "GENERIC",
			}),
		).resolves.toBeUndefined();
		expect(await getUnreadCount({ userId })).toBe(1);
	});
});

describe("menu image service", () => {
	it("presigns for an owned item and confirms the image", async () => {
		const { userId, vendorId, campusId } = await makeVendor();
		const item = await makeMenuItem({ vendorId, campusId });
		const presigned = await presignMenuItemImage({
			userId,
			itemId: item!._id.toString(),
			mimeType: "image/jpeg",
		});
		expect(presigned.key).toContain("menu-items/");
		const confirmed = await confirmMenuItemImage({
			userId,
			itemId: item!._id.toString(),
			imageUrl: "https://img.test/x.jpg",
		});
		expect(confirmed.imageUrl).toBe("https://img.test/x.jpg");
	});

	it("rejects presign for a foreign item", async () => {
		const a = await makeVendor();
		const b = await makeVendor();
		const item = await makeMenuItem({
			vendorId: a.vendorId,
			campusId: a.campusId,
		});
		await expect(
			presignMenuItemImage({
				userId: b.userId,
				itemId: item!._id.toString(),
				mimeType: "image/png",
			}),
		).rejects.toThrow();
	});
});

describe("timetable queries", () => {
	it("todayDayOfWeek maps the JS day index", () => {
		expect(todayDayOfWeek(new Date("2026-07-06"))).toBe(DayOfWeek.MONDAY);
		expect(todayDayOfWeek(new Date("2026-07-05"))).toBe(DayOfWeek.SUNDAY);
	});

	it("returns the grid, a day filter, and today's template joined with items", async () => {
		const { userId, vendorId, campusId } = await makeVendor();
		const item = await createMenuItem({
			userId,
			name: "A",
			category: MenuCategory.MEALS,
			priceNaira: 100,
		});
		const today = todayDayOfWeek();
		await upsertTimetableEntry({
			userId,
			menuItemId: item!._id.toString(),
			dayOfWeek: today,
			isOpen: true,
		});
		expect((await getTimetable({ userId })).length).toBe(1);
		expect(
			(await getTimetableForDay({ userId, dayOfWeek: today })).length,
		).toBe(1);
		const template = await getTodayTemplate({ userId });
		expect(template.length).toBe(1);
		expect(template[0].menuItem).not.toBeNull();
		void vendorId;
		void campusId;
	});
});
