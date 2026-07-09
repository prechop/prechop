import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decrypt } from "@/server/constants/crypto";
import {
	listSnapshotsByVendorDB,
	upsertAnalyticsSnapshotDB,
} from "@/server/models/analyticsSnapshots";
import { createAuditLogDB } from "@/server/models/auditLogs";
import { DayOfWeek } from "@/server/models/enums";
import {
	countUnreadNotificationsDB,
	createNotificationDB,
	listNotificationsDB,
	markAllNotificationsReadDB,
	markNotificationReadDB,
} from "@/server/models/notifications";
import {
	deletePushSubscriptionByEndpointDB,
	listPushSubscriptionsByUserDB,
	upsertPushSubscriptionDB,
} from "@/server/models/pushSubscriptions";
import {
	createRefundDB,
	getRefundByPaymentIdDB,
	markRefundProcessedDB,
} from "@/server/models/refunds";
import {
	createReviewDB,
	deleteReviewDB,
	flagReviewDB,
	getReviewByIdDB,
	getReviewByOrderDB,
	getVendorRatingAggregateDB,
	listFlaggedReviewsDB,
	listReviewsByVendorDB,
	unflagReviewDB,
} from "@/server/models/reviews";
import {
	createSchoolDB,
	getSchoolByIdDB,
	listSchoolsDB,
	toggleSchoolActiveDB,
} from "@/server/models/schools";
import {
	deleteTimetableEntryDB,
	hasAnyTimetableEntryDB,
	listTimetableByVendorDB,
	upsertTimetableEntryDB,
} from "@/server/models/timetableEntries";
import {
	createWhatsappTvDB,
	deactivateWhatsappTvDB,
	listWhatsappTvsByCampusDB,
	updateWhatsappTvDB,
} from "@/server/models/whatsappTvs";
import { connectTestDB, dropAndDisconnect, oid } from "../helpers/db";

beforeAll(async () => {
	await connectTestDB();
});

afterAll(async () => {
	await dropAndDisconnect();
});

describe("schools model", () => {
	it("creates, reads, toggles active, lists", async () => {
		const s = await createSchoolDB({
			payload: {
				name: `Uni ${oid()}`,
				state: "Lagos",
				type: "University",
			},
		});
		expect(s!.isActive).toBe(true);
		const id = s!._id.toString();
		expect((await getSchoolByIdDB({ id }))!.state).toBe("Lagos");
		const toggled = await toggleSchoolActiveDB({ id });
		expect(toggled!.isActive).toBe(false);
		const active = await listSchoolsDB({ activeOnly: true });
		expect(active.find((x) => x._id.toString() === id)).toBeUndefined();
	});

	it("returns null for invalid ids", async () => {
		expect(await getSchoolByIdDB({ id: "nope" })).toBeNull();
		expect(await toggleSchoolActiveDB({ id: oid() })).toBeNull();
	});
});

describe("reviews model", () => {
	it("creates, flags/unflags, deletes and aggregates rating", async () => {
		const vendorId = oid();
		const r1 = await createReviewDB({
			payload: {
				buyerOrderId: oid(),
				vendorId,
				buyerId: oid(),
				rating: 4,
			},
		});
		const r2 = await createReviewDB({
			payload: {
				buyerOrderId: oid(),
				vendorId,
				buyerId: oid(),
				rating: 2,
			},
		});
		expect(r1).not.toBeNull();

		const agg = await getVendorRatingAggregateDB({ vendorId });
		expect(agg.count).toBe(2);
		expect(agg.avg).toBe(3);

		const byOrder = await getReviewByOrderDB({
			buyerOrderId: r1!.buyerOrderId.toString(),
		});
		expect(byOrder!._id.toString()).toBe(r1!._id.toString());
		expect(
			(await getReviewByIdDB({ id: r1!._id.toString() }))!.rating,
		).toBe(4);

		expect(await flagReviewDB({ id: r1!._id.toString() })).toBe(true);
		expect((await listFlaggedReviewsDB({})).length).toBeGreaterThanOrEqual(
			1,
		);
		expect(await unflagReviewDB({ id: r1!._id.toString() })).toBe(true);

		const list = await listReviewsByVendorDB({ vendorId });
		expect(list.length).toBe(2);

		const del = await deleteReviewDB({ id: r2!._id.toString() });
		expect(del!._id.toString()).toBe(r2!._id.toString());
	});

	it("returns safe empties for invalid ids", async () => {
		expect(await getVendorRatingAggregateDB({ vendorId: "x" })).toEqual({
			avg: 0,
			count: 0,
		});
		expect(await flagReviewDB({ id: "x" })).toBe(false);
	});
});

describe("notifications model", () => {
	it("creates, lists, counts unread, marks read", async () => {
		const userId = oid();
		await createNotificationDB({
			payload: {
				userId,
				title: "A",
				body: "b",
				type: "ORDER",
			},
		});
		const n2 = await createNotificationDB({
			payload: { userId, title: "B", body: "b", type: "ORDER" },
		});
		expect(await countUnreadNotificationsDB({ userId })).toBe(2);
		const list = await listNotificationsDB({ userId });
		expect(list.length).toBe(2);

		expect(
			await markNotificationReadDB({ id: n2!._id.toString(), userId }),
		).toBe(true);
		expect(await countUnreadNotificationsDB({ userId })).toBe(1);
		expect(await markAllNotificationsReadDB({ userId })).toBe(true);
		expect(await countUnreadNotificationsDB({ userId })).toBe(0);
	});
});

describe("timetableEntries model", () => {
	it("upserts (idempotent), lists, checks existence, deletes", async () => {
		const vendorId = oid();
		const menuItemId = oid();
		const e = await upsertTimetableEntryDB({
			vendorId,
			menuItemId,
			dayOfWeek: DayOfWeek.MONDAY,
			isOpen: true,
		});
		expect(e!.isOpen).toBe(true);
		// upsert again toggles the same doc (unique index holds)
		const e2 = await upsertTimetableEntryDB({
			vendorId,
			menuItemId,
			dayOfWeek: DayOfWeek.MONDAY,
			isOpen: false,
		});
		expect(e2!._id.toString()).toBe(e!._id.toString());
		expect(e2!.isOpen).toBe(false);

		expect(await hasAnyTimetableEntryDB({ vendorId })).toBe(true);
		expect((await listTimetableByVendorDB({ vendorId })).length).toBe(1);
		expect(
			await deleteTimetableEntryDB({ id: e!._id.toString(), vendorId }),
		).toBe(true);
		expect(await hasAnyTimetableEntryDB({ vendorId })).toBe(false);
	});
});

describe("refunds model", () => {
	it("creates, reads by payment, marks processed", async () => {
		const paymentId = oid();
		const refund = await createRefundDB({
			payload: { paymentId, amountKobo: 155000, reason: "cancelled" },
		});
		expect(refund!.amountKobo).toBe(155000);
		const byPayment = await getRefundByPaymentIdDB({ paymentId });
		expect(byPayment!._id.toString()).toBe(refund!._id.toString());
		expect(
			await markRefundProcessedDB({
				id: refund!._id.toString(),
				paystackRefundId: "rf_123",
			}),
		).toBe(true);
	});
});

describe("pushSubscriptions model", () => {
	it("upserts by endpoint, lists, deletes", async () => {
		const userId = oid();
		const endpoint = `https://push.test/${oid()}`;
		const sub = await upsertPushSubscriptionDB({
			userId,
			endpoint,
			keys: { p256dh: "key", auth: "auth" },
		});
		expect(sub!.endpoint).toBe(endpoint);
		expect((await listPushSubscriptionsByUserDB({ userId })).length).toBe(
			1,
		);
		expect(await deletePushSubscriptionByEndpointDB({ endpoint })).toBe(
			true,
		);
		expect((await listPushSubscriptionsByUserDB({ userId })).length).toBe(
			0,
		);
	});
});

describe("analyticsSnapshots model", () => {
	it("upserts one-per-vendor-per-day and lists in range", async () => {
		const vendorId = oid();
		const date = new Date("2026-07-01T00:00:00Z");
		await upsertAnalyticsSnapshotDB({
			vendorId,
			date,
			payload: { totalOrders: 5, totalRevenueKobo: 500000 },
		});
		const again = await upsertAnalyticsSnapshotDB({
			vendorId,
			date,
			payload: { totalOrders: 8 },
		});
		expect(again!.totalOrders).toBe(8);
		const list = await listSnapshotsByVendorDB({
			vendorId,
			from: new Date("2026-06-01"),
			to: new Date("2026-08-01"),
		});
		expect(list.length).toBe(1);
	});
});

describe("whatsappTvs model", () => {
	it("encrypts the number on create, updates, lists active, deactivates", async () => {
		const campusId = oid();
		const tv = await createWhatsappTvDB({
			campusId,
			name: "Campus TV",
			whatsappNumber: "2348012345678",
			audienceSize: 500,
		});
		expect(tv).not.toBeNull();
		expect(tv!.whatsappNumber).not.toBe("2348012345678");
		expect(decrypt(tv!.whatsappNumber)).toBe("2348012345678");

		const updated = await updateWhatsappTvDB({
			id: tv!._id.toString(),
			payload: { audienceSize: 999 },
		});
		expect(updated!.audienceSize).toBe(999);

		const active = await listWhatsappTvsByCampusDB({
			campusId,
			activeOnly: true,
		});
		expect(active.length).toBe(1);
		expect(await deactivateWhatsappTvDB({ id: tv!._id.toString() })).toBe(
			true,
		);
		expect(
			(await listWhatsappTvsByCampusDB({ campusId, activeOnly: true }))
				.length,
		).toBe(0);
	});

	it("rejects an invalid WhatsApp number (throws to caller)", async () => {
		await expect(
			createWhatsappTvDB({
				campusId: oid(),
				name: "Bad",
				whatsappNumber: "12345",
			}),
		).rejects.toThrow();
	});
});

describe("auditLogs model", () => {
	it("records an audit entry", async () => {
		const log = await createAuditLogDB({
			payload: {
				userId: oid(),
				action: "TEST_ACTION",
				resourceType: "users",
			},
		});
		expect(log).not.toBeNull();
		expect(log!.action).toBe("TEST_ACTION");
	});
});
