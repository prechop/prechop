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
		// Fees are PERCENTAGES sourced from env. This used to assert the retired
		// flat-kobo fields (`platformFeeBuyerKobo`/`platformFeeVendorKobo`) were
		// 0 — they no longer exist, so it was asserting `undefined === 0` and
		// would have gone on "passing" only by accident. Asserting the live
		// fields is the whole point of a test named "env-fallback defaults":
		// tests/setup.ts sets 3% buyer / 8% vendor / ₦200 cap.
		expect(cfg.platformFeeBuyerPercent).toBe(
			DEFAULT_SITE_CONFIGS.platformFeeBuyerPercent,
		);
		expect(cfg.platformFeeVendorPercent).toBe(
			DEFAULT_SITE_CONFIGS.platformFeeVendorPercent,
		);
		expect(cfg.platformFeeBuyerMaxKobo).toBe(
			DEFAULT_SITE_CONFIGS.platformFeeBuyerMaxKobo,
		);
		// Pin the actual numbers too — a default that silently drifts to 0 is
		// the money bug tests/constants/fees.test.ts exists to prevent.
		expect(cfg.platformFeeBuyerPercent).toBe(3);
		expect(cfg.platformFeeVendorPercent).toBe(8);
		expect(cfg.platformFeeBuyerMaxKobo).toBe(20_000);
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
