import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { upsertSiteConfigsDB } from "@/server/models/siteConfigs";
import { DEFAULT_SITE_CONFIGS } from "@/server/models/siteConfigs/types";
import {
	getSiteConfigs,
	invalidateSiteConfigsCache,
} from "@/server/services/siteConfigs/getSiteConfigs";
import { connectTestDB, dropAndDisconnect } from "../helpers/db";

beforeAll(async () => {
	await connectTestDB();
});

afterAll(async () => {
	invalidateSiteConfigsCache();
	await dropAndDisconnect();
});

beforeEach(() => {
	invalidateSiteConfigsCache();
});

describe("getSiteConfigs service", () => {
	it("returns env-fallback defaults before any doc is seeded", async () => {
		const cfg = await getSiteConfigs();
		// env fallback uses PLATFORM_FEE_*_KOBO from tests/setup.ts (5000/10000)
		expect(cfg.platformFeeBuyerKobo).toBe(5000);
		expect(cfg.platformFeeVendorKobo).toBe(10000);
		expect(cfg.slotHoldTtlSeconds).toBe(
			DEFAULT_SITE_CONFIGS.slotHoldTtlSeconds,
		);
		expect(cfg.ordersKillSwitch).toBe(false);
	});

	it("merges the seeded doc over the fallback after invalidation", async () => {
		await upsertSiteConfigsDB({
			payload: { ordersKillSwitch: true, reviewWindowHours: 12 },
			updatedBy: "admin",
		});
		invalidateSiteConfigsCache();
		const cfg = await getSiteConfigs();
		expect(cfg.ordersKillSwitch).toBe(true);
		expect(cfg.reviewWindowHours).toBe(12);
	});

	it("serves a cached value on the second read within TTL", async () => {
		await getSiteConfigs(); // populate cache
		await upsertSiteConfigsDB({
			payload: { reviewWindowHours: 99 },
			updatedBy: "admin",
		});
		// no invalidation → cached value still returned
		const cfg = await getSiteConfigs();
		expect(cfg.reviewWindowHours).not.toBe(99);
	});
});
