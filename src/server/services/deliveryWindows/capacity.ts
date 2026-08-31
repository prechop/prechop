import { Redis } from "@/server/databases";

function capacityKey(deliveryWindowId: string, dateStr: string): string {
	return `dw:capacity:${deliveryWindowId}:${dateStr}`;
}

function capacityOrderKey(
	deliveryWindowId: string,
	dateStr: string,
	orderId: string,
): string {
	return `dw:capacity:${deliveryWindowId}:${dateStr}:order:${orderId}`;
}

export interface DeliveryWindowCapacityInput {
	deliveryWindowId: string;
	date: Date;
	quantity: number;
	orderId?: string;
}

export interface DeliveryWindowCapacity {
	reservedQuantity: number;
	remainingQuantity: number;
}

export async function getDeliveryWindowCapacity({
	deliveryWindowId,
	date,
	maxCapacity,
}: {
	deliveryWindowId: string;
	date: Date;
	maxCapacity: number;
}): Promise<DeliveryWindowCapacity> {
	const dateStr = dateToStr(date);
	const raw = await Redis.get(capacityKey(deliveryWindowId, dateStr));
	const reserved = Number(raw ?? 0);
	const safeReserved = Number.isFinite(reserved) && reserved > 0 ? reserved : 0;
	const remaining = Math.max(0, maxCapacity - safeReserved);
	return { reservedQuantity: safeReserved, remainingQuantity: remaining };
}

export async function reserveDeliveryWindowCapacity({
	deliveryWindowId,
	date,
	quantity,
	orderId,
}: DeliveryWindowCapacityInput): Promise<{ ok: boolean; remaining?: number }> {
	if (quantity <= 0) return { ok: true };
	const dateStr = dateToStr(date);
	const key = capacityKey(deliveryWindowId, dateStr);
	const reservedAfter = await Redis.incrby(key, quantity);
	await Redis.expire(key, 600);
	if (orderId) {
		const ownerKey = capacityOrderKey(deliveryWindowId, dateStr, orderId);
		await Redis.incrby(ownerKey, quantity);
		await Redis.expire(ownerKey, 600);
	}
	return { ok: true };
}

export async function releaseDeliveryWindowCapacity({
	deliveryWindowId,
	date,
	quantity,
	orderId,
}: DeliveryWindowCapacityInput): Promise<void> {
	if (quantity <= 0) return;
	const dateStr = dateToStr(date);
	const key = capacityKey(deliveryWindowId, dateStr);
	const after = await Redis.decrby(key, quantity);
	if (after < 0) await Redis.set(key, "0");
	if (orderId) {
		const ownerKey = capacityOrderKey(deliveryWindowId, dateStr, orderId);
		const ownerAfter = await Redis.decrby(ownerKey, quantity);
		if (ownerAfter <= 0) await Redis.del(ownerKey);
	}
}

function dateToStr(date: Date): string {
	return date.toISOString().slice(0, 10);
}
