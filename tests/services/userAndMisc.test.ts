import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { encrypt } from "@/server/constants/crypto";
import { createNotificationDB } from "@/server/models/notifications";
import { getUserByIdDB } from "@/server/models/users";
import { createWhatsappTvDB } from "@/server/models/whatsappTvs";
import { listActiveCampuses } from "@/server/services/campus/listActiveCampuses";
import { createUserNotification } from "@/server/services/notifications/createUserNotification";
import {
	getUnreadCount,
	listNotifications,
	markAllNotificationsRead,
	markNotificationRead,
} from "@/server/services/notifications/listNotifications";
import { deactivateAccount } from "@/server/services/users/deactivateAccount";
import { getMe } from "@/server/services/users/getMe";
import { updateCampus } from "@/server/services/users/updateCampus";
import { updateProfile } from "@/server/services/users/updateProfile";
import { listVendorWhatsappTvs } from "@/server/services/whatsappTvs/listVendorWhatsappTvs";
import {
	connectTestDB,
	dropAndDisconnect,
	oid,
	uniquePhone,
} from "../helpers/db";
import { makeCampus, makeUser } from "../helpers/factories";

beforeAll(async () => {
	await connectTestDB();
});

afterAll(async () => {
	await dropAndDisconnect();
});

describe("users services", () => {
	it("getMe returns the decrypted profile", async () => {
		const phone = uniquePhone();
		const { createUserDB } = await import("@/server/models/users");
		const user = await createUserDB({
			payload: {
				campusId: oid(),
				firstName: "Ada",
				lastName: "Obi",
				phone,
			},
		});
		const me = await getMe({ userId: user!._id.toString() });
		expect(me.phone).toBe(phone);
		expect(me.firstName).toBe("Ada");
	});

	it("getMe throws for an unknown user", async () => {
		await expect(getMe({ userId: oid() })).rejects.toThrow();
	});

	it("updateProfile changes the name", async () => {
		const user = await makeUser();
		const updated = await updateProfile({
			userId: user!._id.toString(),
			firstName: "Renamed",
		});
		expect(updated.firstName).toBe("Renamed");
	});

	it("updateCampus rejects an inactive/unknown campus and accepts a valid one", async () => {
		const user = await makeUser();
		const campus = await makeCampus();
		const moved = await updateCampus({
			userId: user!._id.toString(),
			campusId: campus!._id.toString(),
		});
		expect(moved.campusId).toBe(campus!._id.toString());
		await expect(
			updateCampus({ userId: user!._id.toString(), campusId: oid() }),
		).rejects.toThrow();
	});

	it("deactivateAccount flips isActive", async () => {
		const user = await makeUser();
		const res = await deactivateAccount({ userId: user!._id.toString() });
		expect(res.success).toBe(true);
		const read = await getUserByIdDB({ id: user!._id.toString() });
		expect(read!.isActive).toBe(false);
	});
});

describe("campus service", () => {
	it("lists active campuses in public shape", async () => {
		await makeCampus({ name: "Active Uni" });
		const list = await listActiveCampuses();
		expect(list.length).toBeGreaterThanOrEqual(1);
		expect(list[0]).toHaveProperty("shortCode");
		expect(list[0]).not.toHaveProperty("isActive");
	});
});

describe("whatsappTvs service", () => {
	it("returns public TV entries with wa.me links (number decrypted)", async () => {
		const campusId = oid();
		await createWhatsappTvDB({
			campusId,
			name: "Campus TV",
			whatsappNumber: "2348012345678",
			audienceSize: 100,
		});
		const list = await listVendorWhatsappTvs({ campusId });
		expect(list.length).toBe(1);
		expect(list[0].waUrl).toBe("https://wa.me/2348012345678");
		expect(list[0]).not.toHaveProperty("whatsappNumber");
	});
});

describe("notifications service", () => {
	it("lists with unread count and marks read", async () => {
		const userId = oid();
		await createNotificationDB({
			payload: { userId, title: "A", body: "b", type: "ORDER" },
		});
		const n2 = await createNotificationDB({
			payload: { userId, title: "B", body: "b", type: "ORDER" },
		});
		const { items, unread } = await listNotifications({ userId });
		expect(items.length).toBe(2);
		expect(unread).toBe(2);

		expect(
			await markNotificationRead({ id: n2!._id.toString(), userId }),
		).toBe(true);
		expect(await getUnreadCount({ userId })).toBe(1);
		expect(await markAllNotificationsRead({ userId })).toBe(true);
		expect(await getUnreadCount({ userId })).toBe(0);
	});

	it("createUserNotification persists and never throws (no push subs)", async () => {
		const userId = oid();
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
