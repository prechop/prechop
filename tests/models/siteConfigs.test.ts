import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	DEFAULT_SITE_CONFIGS,
	getSiteConfigsDocDB,
	upsertSiteConfigsDB,
} from "@/server/models/siteConfigs";
import { connectTestDB, dropAndDisconnect } from "../helpers/db";

beforeAll(async () => {
	await connectTestDB();
});

afterAll(async () => {
	await dropAndDisconnect();
});

describe("siteConfigs model", () => {
	it("returns null before any doc is seeded", async () => {
		expect(await getSiteConfigsDocDB()).toBeNull();
	});

	it("upsert creates a single doc applying defaults for unset fields", async () => {
		const res = await upsertSiteConfigsDB({
			payload: { ordersKillSwitch: true },
			updatedBy: "admin-1",
		});
		expect(res).not.toBeNull();
		expect(res!.ordersKillSwitch).toBe(true);
		// defaults filled in on insert
		expect(res!.platformFeeBuyerKobo).toBe(
			DEFAULT_SITE_CONFIGS.platformFeeBuyerKobo,
		);
		expect(res!.slotHoldTtlSeconds).toBe(
			DEFAULT_SITE_CONFIGS.slotHoldTtlSeconds,
		);
		expect(res!.updatedBy).toBe("admin-1");
	});

	it("upsert updates the existing doc (still a single doc)", async () => {
		const updated = await upsertSiteConfigsDB({
			payload: { reviewWindowHours: 24, ordersKillSwitch: false },
			updatedBy: "admin-2",
		});
		expect(updated!.reviewWindowHours).toBe(24);
		expect(updated!.ordersKillSwitch).toBe(false);

		const doc = await getSiteConfigsDocDB();
		expect(doc!.reviewWindowHours).toBe(24);
		expect(doc!.updatedBy).toBe("admin-2");
	});
});
