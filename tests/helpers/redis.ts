// Redis test helpers. Tests must delete only the keys they created and never
// FLUSH the shared Redis. `trackKey` records keys so a test can clean up in
// `afterEach`/`afterAll` even after a failure.

import { Redis } from "@/server/databases/redis";

const created = new Set<string>();

/** Remember a key so it gets cleaned up later. Returns the key unchanged. */
export function trackKey(key: string): string {
	created.add(key);
	return key;
}

/** A namespaced, unique key for a test so parallel workers never collide. */
export function testKey(suffix: string): string {
	const key = `vitest:${process.pid}:${Math.random().toString(36).slice(2)}:${suffix}`;
	created.add(key);
	return key;
}

/** Delete every tracked key. Safe to call repeatedly. */
export async function cleanupTrackedKeys(): Promise<void> {
	if (created.size === 0) return;
	const keys = [...created];
	created.clear();
	try {
		await Redis.del(...keys);
	} catch {
		// best effort
	}
}

export { Redis };
