import { Redis } from "@/server/databases";
import {
	DeliveryWindow,
	listDeliveryWindowsByVendorDB,
} from "@/server/models/deliveryWindows";
import { MealTime, DayOfWeek } from "@/server/models/enums";
import { StickerBatch, listStickerBatchesByVendorDB } from "@/server/models/stickerBatches";
import type { IDeliveryWindow } from "@/server/models/deliveryWindows/types";
import type { IStickerBatch } from "@/server/models/stickerBatches/types";

function windowKey(windowId: string, dateStr: string): string {
	return `dw:capacity:${windowId}:${dateStr}`;
}

function windowOrderKey(windowId: string, dateStr: string, orderId: string): string {
	return `dw:capacity:${windowId}:${dateStr}:order:${orderId}`;
}

function pausedKey(windowId: string, dateStr: string): string {
	return `dw:paused:${windowId}:${dateStr}`;
}

function pad2(n: number): string {
	return n < 10 ? `0${n}` : String(n);
}

function windowEndDate(
	todayStr: string,
	orderWindowStart: string,
	orderWindowEnd: string,
): string {
	const isOvernight = orderWindowEnd <= orderWindowStart;
	const base = new Date(
		Number(todayStr.slice(0, 4)),
		Number(todayStr.slice(5, 7)) - 1,
		Number(todayStr.slice(8, 10)),
		0,
		0,
	);
	const endDate = isOvernight
		? new Date(base.getTime() + 86400000)
		: base;
	const endDateStr = `${endDate.getFullYear()}-${pad2(endDate.getMonth() + 1)}-${pad2(endDate.getDate())}`;
	return `${endDateStr}T${orderWindowEnd}`;
}

export interface TodaysBatch {
	window: IDeliveryWindow;
	batch: IStickerBatch | null;
	capacity: {
		reservedQuantity: number;
		remainingQuantity: number;
	};
	status: "open" | "paused" | "closed" | "full";
	paused: boolean;
}

export interface BatchAvailabilityInput {
	vendorId: string;
	date: Date;
	mealTime?: MealTime;
	all?: boolean;
}

function timeToMinutes(time: string): number {
	const [hours, minutes] = time.split(":").map(Number);
	return hours * 60 + minutes;
}

export async function getTodaysBatches({
	vendorId,
	date,
	mealTime,
	all,
}: BatchAvailabilityInput): Promise<TodaysBatch[]> {
	const windows = await listDeliveryWindowsByVendorDB({ vendorId });
	const todayStr = date.toISOString().slice(0, 10);
	const now = new Date();

	const relevant = windows.filter((w) => {
		if (!w.active) return false;
		if (mealTime && w.mealTime !== mealTime) return false;
		if (all) return true;
		const start = new Date(`${todayStr}T${w.orderWindowStart}`);
		const end = new Date(windowEndDate(todayStr, w.orderWindowStart, w.orderWindowEnd));
		if (now < start) return false;
		return true;
	});

	const batches = await listStickerBatchesByVendorDB({ vendorId });
	const activeBatches = batches.filter((b) => b.status === "ACTIVE");

	const results: TodaysBatch[] = [];
	for (const window of relevant) {
		const batch = activeBatches.find((b) => {
			const batchDate = new Date(b.createdAt);
			return batchDate.toISOString().slice(0, 10) === todayStr;
		}) || activeBatches[0] || null;

		const raw = await Redis.get(windowKey(window._id, todayStr));
		const reserved = Number(raw ?? 0);
		const safeReserved = Number.isFinite(reserved) && reserved > 0 ? reserved : 0;
		const remaining = Math.max(0, window.capacity - safeReserved);

		const orderWindowEnd = new Date(
			windowEndDate(todayStr, window.orderWindowStart, window.orderWindowEnd),
		);
		const windowClosed = now > orderWindowEnd;
		const pausedRaw = await Redis.get(pausedKey(window._id, todayStr));
		const paused = pausedRaw === "1";

		let status: TodaysBatch["status"] = "open";
		if (windowClosed) {
			status = "closed";
		} else if (paused) {
			status = "paused";
		} else if (remaining <= 0) {
			status = "full";
		}

		results.push({
			window,
			batch,
			capacity: {
				reservedQuantity: safeReserved,
				remainingQuantity: remaining,
			},
			status,
			paused,
		});
	}

	return results;
}

export async function isBatchPausedForToday(
	windowId: string,
	date: Date,
): Promise<boolean> {
	const dateStr = date.toISOString().slice(0, 10);
	const raw = await Redis.get(pausedKey(windowId, dateStr));
	return raw === "1";
}

export async function pauseBatchForToday({
	windowId,
	date,
}: {
	windowId: string;
	date: Date;
}): Promise<void> {
	const dateStr = date.toISOString().slice(0, 10);
	const tomorrow = new Date(date);
	tomorrow.setDate(tomorrow.getDate() + 1);
	const ttlSeconds =
		Math.max(1, Math.floor((tomorrow.getTime() - Date.now()) / 1000)) + 60;
	await Redis.set(pausedKey(windowId, dateStr), "1", "EX", ttlSeconds);
}

export async function resumeBatchForToday({
	windowId,
	date,
	orderWindowEnd,
}: {
	windowId: string;
	date: Date;
	orderWindowEnd: string;
}): Promise<boolean> {
	const now = new Date();
	const dateStr = date.toISOString().slice(0, 10);
	const end = new Date(`${dateStr}T${orderWindowEnd}`);
	if (now >= end) return false;
	await Redis.del(pausedKey(windowId, dateStr));
	return true;
}

export async function reserveBatchCapacity({
	windowId,
	date,
	quantity,
	orderId,
}: {
	windowId: string;
	date: Date;
	quantity: number;
	orderId?: string;
}): Promise<{ ok: boolean; remaining?: number }> {
	if (quantity <= 0) return { ok: true };
	const dateStr = date.toISOString().slice(0, 10);
	const paused = await isBatchPausedForToday(windowId, date);
	if (paused) return { ok: false };
	const key = windowKey(windowId, dateStr);
	const reservedAfter = await Redis.incrby(key, quantity);
	const tomorrow = new Date(date);
	tomorrow.setDate(tomorrow.getDate() + 1);
	const ttlSeconds =
		Math.max(1, Math.floor((tomorrow.getTime() - Date.now()) / 1000)) + 60;
	await Redis.expire(key, ttlSeconds);
	if (orderId) {
		const ownerKey = windowOrderKey(windowId, dateStr, orderId);
		await Redis.incrby(ownerKey, quantity);
		await Redis.expire(ownerKey, ttlSeconds);
	}
	const raw = await Redis.get(key);
	const remaining = Number(raw ?? reservedAfter);
	return { ok: true, remaining };
}

export async function releaseBatchCapacity({
	windowId,
	date,
	quantity,
	orderId,
}: {
	windowId: string;
	date: Date;
	quantity: number;
	orderId?: string;
}): Promise<void> {
	if (quantity <= 0) return;
	const dateStr = date.toISOString().slice(0, 10);
	const key = windowKey(windowId, dateStr);
	const after = await Redis.decrby(key, quantity);
	if (after < 0) await Redis.set(key, "0");
	if (orderId) {
		const ownerKey = windowOrderKey(windowId, dateStr, orderId);
		const ownerAfter = await Redis.decrby(ownerKey, quantity);
		if (ownerAfter <= 0) await Redis.del(ownerKey);
	}
}
