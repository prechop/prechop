import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateShareableToken } from "@/server/constants/orderNumber";
import {
	closeExpiredDailyOrdersDB,
	createDailyOrderDB,
	getDailyOrderByIdDB,
	getDailyOrderByTokenDB,
	incrementDailyOrderItemQuantityDB,
	incrementDailyOrderTotalCountDB,
	listActiveDailyOrdersByCampusDB,
	listDailyOrdersByVendorDB,
	setDailyOrderStatusDB,
	updateDailyOrderDraftDB,
} from "@/server/models/dailyOrders";
import { DailyOrderStatus } from "@/server/models/enums";
import { connectTestDB, dropAndDisconnect, oid } from "../helpers/db";

beforeAll(async () => {
	await connectTestDB();
});

afterAll(async () => {
	await dropAndDisconnect();
});

function makePayload(overrides: Record<string, unknown> = {}) {
	return {
		vendorId: oid(),
		campusId: oid(),
		shareableToken: generateShareableToken(),
		title: "Friday Lunch",
		scheduledDate: new Date(Date.now() + 3_600_000),
		cutoffTime: new Date(Date.now() + 1_800_000),
		items: [
			{
				menuItemId: oid(),
				snapshotName: "Jollof",
				snapshotPriceKobo: 150000,
				snapshotPrepMin: 20,
				maxQuantity: 10,
				addons: [{ name: "Extra Meat", priceKobo: 50000 }],
			},
		],
		...overrides,
	};
}

describe("dailyOrders model", () => {
	it("creates a DRAFT listing with mapped items + addons", async () => {
		const d = await createDailyOrderDB({ payload: makePayload() });
		expect(d).not.toBeNull();
		expect(d!.status).toBe(DailyOrderStatus.DRAFT);
		expect(d!.items[0].orderedQuantity).toBe(0);
		expect(d!.items[0].addons[0].name).toBe("Extra Meat");
	});

	it("reads by id (with embedded string ids) and by token", async () => {
		const token = generateShareableToken();
		const d = await createDailyOrderDB({
			payload: makePayload({ shareableToken: token }),
		});
		const byId = await getDailyOrderByIdDB({ id: d!._id.toString() });
		expect(byId!.items[0].id).toBeTruthy();
		const byToken = await getDailyOrderByTokenDB({ shareableToken: token });
		expect(byToken!._id.toString()).toBe(d!._id.toString());
	});

	it("transitions DRAFT → ACTIVE via fromStatuses guard", async () => {
		const vendorId = oid();
		const d = await createDailyOrderDB({
			payload: makePayload({ vendorId }),
		});
		const id = d!._id.toString();
		const ok = await setDailyOrderStatusDB({
			id,
			vendorId,
			status: DailyOrderStatus.ACTIVE,
			fromStatuses: [DailyOrderStatus.DRAFT],
		});
		expect(ok).toBe(true);
		// second DRAFT→ACTIVE fails: no longer in DRAFT
		const again = await setDailyOrderStatusDB({
			id,
			vendorId,
			status: DailyOrderStatus.ACTIVE,
			fromStatuses: [DailyOrderStatus.DRAFT],
		});
		expect(again).toBe(false);
	});

	it("edits a listing (DRAFT or ACTIVE) until it opens, then locks", async () => {
		const vendorId = oid();
		const opensAt = new Date(Date.now() + 3_600_000); // opens in 1h
		const d = await createDailyOrderDB({
			payload: makePayload({ vendorId, availableFrom: opensAt }),
		});
		const id = d!._id.toString();

		// Editable while it hasn't opened — as a DRAFT…
		const edited = await updateDailyOrderDraftDB({
			id,
			vendorId,
			payload: { title: "Updated" },
			now: new Date(),
		});
		expect(edited!.title).toBe("Updated");

		// …and still editable once ACTIVE, as long as orders haven't opened.
		await setDailyOrderStatusDB({
			id,
			vendorId,
			status: DailyOrderStatus.ACTIVE,
		});
		const stillEditable = await updateDailyOrderDraftDB({
			id,
			vendorId,
			payload: { title: "Updated again" },
			now: new Date(),
		});
		expect(stillEditable!.title).toBe("Updated again");

		// Once orders have opened (now past availableFrom) editing is locked.
		const locked = await updateDailyOrderDraftDB({
			id,
			vendorId,
			payload: { title: "Nope" },
			now: new Date(opensAt.getTime() + 1000),
		});
		expect(locked).toBeNull();
	});

	it("never edits a listing that has no open time (opens immediately)", async () => {
		const vendorId = oid();
		const d = await createDailyOrderDB({
			payload: makePayload({ vendorId }),
		});
		const locked = await updateDailyOrderDraftDB({
			id: d!._id.toString(),
			vendorId,
			payload: { title: "Nope" },
			now: new Date(),
		});
		expect(locked).toBeNull();
	});

	it("increments an item quantity via the positional operator", async () => {
		const d = await createDailyOrderDB({ payload: makePayload() });
		const itemId = d!.items[0]._id!.toString();
		const ok = await incrementDailyOrderItemQuantityDB({
			dailyOrderId: d!._id.toString(),
			dailyOrderItemId: itemId,
			by: 4,
		});
		expect(ok).toBe(true);
		const read = await getDailyOrderByIdDB({ id: d!._id.toString() });
		expect(read!.items[0].orderedQuantity).toBe(4);

		expect(
			await incrementDailyOrderTotalCountDB({
				dailyOrderId: d!._id.toString(),
				by: 2,
			}),
		).toBe(true);
	});

	it("lists active listings by campus and by vendor", async () => {
		const campusId = oid();
		const vendorId = oid();
		const active = await createDailyOrderDB({
			payload: makePayload({ campusId, vendorId }),
		});
		await setDailyOrderStatusDB({
			id: active!._id.toString(),
			vendorId,
			status: DailyOrderStatus.ACTIVE,
		});
		const byCampus = await listActiveDailyOrdersByCampusDB({ campusId });
		expect(byCampus.length).toBe(1);

		const byVendor = await listDailyOrdersByVendorDB({ vendorId });
		expect(byVendor.length).toBe(1);
	});

	it("closes expired ACTIVE listings via the cron sweep", async () => {
		const vendorId = oid();
		const d = await createDailyOrderDB({
			payload: makePayload({
				vendorId,
				cutoffTime: new Date(Date.now() - 1000),
			}),
		});
		await setDailyOrderStatusDB({
			id: d!._id.toString(),
			vendorId,
			status: DailyOrderStatus.ACTIVE,
		});
		const closed = await closeExpiredDailyOrdersDB();
		expect(closed).toBeGreaterThanOrEqual(1);
		const read = await getDailyOrderByIdDB({ id: d!._id.toString() });
		expect(read!.status).toBe(DailyOrderStatus.CLOSED);
	});
});
