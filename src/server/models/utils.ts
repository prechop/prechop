import type mongoose from "mongoose";

export const transactionOptions: mongoose.mongo.TransactionOptions = {
	readPreference: "primary",
	readConcern: { level: "local" },
	writeConcern: { w: "majority" },
};

export enum IOperationType {
	Create = "create",
	Read = "read",
	Update = "update",
	Delete = "delete",
}

/**
 * The timezone the platform's business day runs on. Prechop is a Nigerian
 * campus product, so "today", "midnight" and "peak hour" are all Africa/Lagos
 * (UTC+1, no DST) regardless of what the server's clock is set to. Never use
 * UTC-midnight or server-local midnight for day boundaries — a UTC day starts
 * at 01:00 Lagos and would file an hour of every evening's orders under the
 * wrong date.
 */
export const PLATFORM_TIMEZONE = "Africa/Lagos";

/** Wall-clock calendar/time fields of `at` as observed in `timeZone`. */
function wallClockPartsInTimezone(at: Date, timeZone: string) {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone,
		hourCycle: "h23",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	}).formatToParts(at);
	const p: Record<string, string> = {};
	for (const { type, value } of parts) p[type] = value;
	return {
		year: Number(p.year),
		month: Number(p.month),
		day: Number(p.day),
		hour: Number(p.hour),
		minute: Number(p.minute),
		second: Number(p.second),
	};
}

/** Milliseconds `timeZone` is ahead of UTC at the instant `at`. */
function timezoneOffsetMs(at: Date, timeZone: string): number {
	const w = wallClockPartsInTimezone(at, timeZone);
	const asIfUTC = Date.UTC(
		w.year,
		w.month - 1,
		w.day,
		w.hour,
		w.minute,
		w.second,
		at.getUTCMilliseconds(),
	);
	return asIfUTC - at.getTime();
}

/**
 * The UTC instant at which the calendar day containing `at` began in
 * `timeZone`. Resolved through the IANA database (not a hardcoded +1) so it
 * stays correct if the platform ever runs in a DST zone.
 */
export function startOfDayInTimezone(
	at: Date,
	timeZone: string = PLATFORM_TIMEZONE,
): Date {
	const w = wallClockPartsInTimezone(at, timeZone);
	const midnightAsIfUTC = Date.UTC(w.year, w.month - 1, w.day, 0, 0, 0, 0);
	// Subtract the offset to get the real instant, then re-resolve once using
	// the offset *at that instant* so DST transitions land on the right side.
	const firstPass = midnightAsIfUTC - timezoneOffsetMs(at, timeZone);
	return new Date(
		midnightAsIfUTC - timezoneOffsetMs(new Date(firstPass), timeZone),
	);
}

/**
 * Half-open `[from, to)` window covering the calendar day *before* the one
 * containing `reference`, in `timeZone`. This is the window the nightly
 * analytics snapshot aggregates over; it is stable no matter what hour the
 * cron actually fires, so a cron running on a UTC server still snapshots the
 * correct Lagos day.
 */
export function previousDayWindowInTimezone(
	reference: Date,
	timeZone: string = PLATFORM_TIMEZONE,
): { from: Date; to: Date } {
	const to = startOfDayInTimezone(reference, timeZone);
	// Step 12h back — lands at midday of the previous day in any zone, DST or
	// not — then snap to that day's midnight.
	const from = startOfDayInTimezone(
		new Date(to.getTime() - 12 * 60 * 60 * 1000),
		timeZone,
	);
	return { from, to };
}
