import { getSiteConfigsDocDB } from "../../models";
import {
	DEFAULT_SITE_CONFIGS,
	type ISiteConfigs,
} from "../../models/siteConfigs/types";

// Short in-process cache so the hot path (every order/marketplace read) doesn't
// hit Mongo for policy each time. gkoi's siteConfigs pattern.
const CACHE_TTL_MS = 10_000;

interface CacheEntry {
	value: ISiteConfigs;
	expiresAt: number;
}

declare global {
	// eslint-disable-next-line no-var
	var __prechopSiteConfigsCache: CacheEntry | undefined;
}

function envFallback(): ISiteConfigs {
	return {
		...DEFAULT_SITE_CONFIGS,
	};
}

/**
 * Resolve runtime policy. Precedence: cached siteConfigs doc ► env constant
 * fallback ► hard-coded defaults. Reads NEVER throw — on any error the env
 * fallback is returned so the app keeps running even before siteConfigs is
 * seeded.
 */
export async function getSiteConfigs(): Promise<ISiteConfigs> {
	const now = Date.now();
	const cached = global.__prechopSiteConfigsCache;
	if (cached && cached.expiresAt > now) return cached.value;

	let value: ISiteConfigs;
	try {
		const doc = await getSiteConfigsDocDB();
		value = doc ? { ...envFallback(), ...doc } : envFallback();
	} catch {
		value = envFallback();
	}

	global.__prechopSiteConfigsCache = {
		value,
		expiresAt: now + CACHE_TTL_MS,
	};
	return value;
}

/** Invalidate the cache after an admin update so the next read is fresh. */
export function invalidateSiteConfigsCache(): void {
	global.__prechopSiteConfigsCache = undefined;
}
