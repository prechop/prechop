import IoRedis from "ioredis";
import { REDIS_URI } from "../constants";

declare global {
	// eslint-disable-next-line no-var
	var __prechopRedis: IoRedis | undefined;
}

function createRedis(): IoRedis {
	return new IoRedis(REDIS_URI, {
		retryStrategy(times) {
			return Math.min(times * 50, 2000);
		},
		maxRetriesPerRequest: 3,
		enableReadyCheck: true,
		lazyConnect: false,
	});
}

export const Redis: IoRedis = global.__prechopRedis ?? createRedis();

if (!global.__prechopRedis) {
	global.__prechopRedis = Redis;
}

export async function disconnectRedis(): Promise<void> {
	try {
		await Redis.quit();
	} catch {
		// no-op
	}
}

export async function redisUpdateKeyString<T>(
	query: string,
	data: T,
	expire = true,
	seconds?: number,
): Promise<boolean> {
	seconds = seconds ?? 60;
	if (expire) {
		const response = await Redis.setex(
			query,
			seconds,
			JSON.stringify(data),
		);
		return response === "OK";
	}
	const response = await Redis.set(query, JSON.stringify(data));
	return response === "OK";
}

export async function redisRetrieveKeyString<T>(
	query: string,
): Promise<T | undefined> {
	const response = await Redis.get(query);
	if (response === null) return undefined;
	return JSON.parse(response) as T;
}

export async function redisDeleteKeys(...queries: string[]): Promise<boolean> {
	if (queries.length === 0) return false;
	const resolvedKeys = (
		await Promise.allSettled(queries.map((query) => Redis.keys(query)))
	).flatMap((item) =>
		item.status === "rejected" ? [] : (item.value as string[]),
	);
	if (!resolvedKeys.length) return false;
	const response = await Redis.del(resolvedKeys);
	return response > 0;
}

/**
 * Acquire a single-owner lock via `SET key value NX EX`. Returns true iff the
 * lock was newly acquired. Used for slot holds and single-instance cron ticks.
 */
export async function acquireLock(
	key: string,
	value: string,
	ttlSeconds: number,
): Promise<boolean> {
	const result = await Redis.set(key, value, "EX", ttlSeconds, "NX");
	return result === "OK";
}

/** Release a lock only if we still own it (value matches). */
export async function releaseLock(key: string, value: string): Promise<void> {
	const stored = await Redis.get(key);
	if (stored === value) await Redis.del(key);
}
