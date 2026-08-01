import { Redis } from "../../databases";

// Oversell protection. Each daily-order item with a finite `maxQuantity` has a
// Redis reservation counter tracking quantity held by orders that are still in
// PENDING_PAYMENT. Availability = maxQuantity − committed(orderedQuantity) −
// reserved. Reservations use atomic INCRBY so concurrent buyers can't both slip
// past the same last slot; the hold auto-expires after the configured TTL.

function reservedKey(dailyOrderItemId: string): string {
	return `slot:reserved:${dailyOrderItemId}`;
}

function reservationKey(
	dailyOrderItemId: string,
	reservationId: string,
): string {
	return `slot:reserved:${dailyOrderItemId}:order:${reservationId}`;
}

export interface SlotRequest {
	dailyOrderItemId: string;
	quantity: number;
	committed: number; // orderedQuantity snapshot from the listing
	maxQuantity: number | null | undefined;
}

export interface SlotAvailabilityInput {
	id?: string;
	_id?: { toString(): string } | string;
	maxQuantity?: number | null;
	orderedQuantity?: number;
}

export interface SlotAvailability {
	reservedQuantity: number;
	remainingQuantity: number | null;
}

function idOf(item: SlotAvailabilityInput): string {
	return String(item.id ?? item._id ?? "");
}

function remainingFrom({
	maxQuantity,
	orderedQuantity,
	reservedQuantity,
}: {
	maxQuantity: number | null | undefined;
	orderedQuantity: number | undefined;
	reservedQuantity: number;
}): number | null {
	if (maxQuantity === null || maxQuantity === undefined) return null;
	return Math.max(0, maxQuantity - (orderedQuantity ?? 0) - reservedQuantity);
}

export async function getReservedSlotQuantity(
	dailyOrderItemId: string,
): Promise<number> {
	const raw = await Redis.get(reservedKey(dailyOrderItemId));
	const parsed = Number(raw ?? 0);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export async function getReservedSlotQuantityForReservation(
	dailyOrderItemId: string,
	reservationId: string,
): Promise<number> {
	const raw = await Redis.get(
		reservationKey(dailyOrderItemId, reservationId),
	);
	const parsed = Number(raw ?? 0);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export async function getSlotAvailability(
	items: SlotAvailabilityInput[],
): Promise<Map<string, SlotAvailability>> {
	const finite = items.filter(
		(item) =>
			item.maxQuantity !== null &&
			item.maxQuantity !== undefined &&
			idOf(item),
	);
	const reservedValues = finite.length
		? await Redis.mget(...finite.map((item) => reservedKey(idOf(item))))
		: [];
	const reservedById = new Map<string, number>();
	finite.forEach((item, index) => {
		const parsed = Number(reservedValues[index] ?? 0);
		reservedById.set(
			idOf(item),
			Number.isFinite(parsed) && parsed > 0 ? parsed : 0,
		);
	});
	return new Map(
		items
			.map((item) => {
				const id = idOf(item);
				if (!id) return null;
				const reservedQuantity = reservedById.get(id) ?? 0;
				return [
					id,
					{
						reservedQuantity,
						remainingQuantity: remainingFrom({
							maxQuantity: item.maxQuantity,
							orderedQuantity: item.orderedQuantity,
							reservedQuantity,
						}),
					},
				] as const;
			})
			.filter((entry): entry is readonly [string, SlotAvailability] =>
				Boolean(entry),
			),
	);
}

export async function withSlotAvailability<
	T extends { items?: SlotAvailabilityInput[] },
>(listing: T): Promise<T> {
	const items = listing.items ?? [];
	const availability = await getSlotAvailability(items);
	return {
		...listing,
		items: items.map((item) => {
			const stats = availability.get(idOf(item));
			return stats ? { ...item, ...stats } : item;
		}),
	};
}

export async function withSlotAvailabilityForListings<
	T extends { items?: SlotAvailabilityInput[] },
>(listings: T[]): Promise<T[]> {
	return Promise.all(
		listings.map((listing) => withSlotAvailability(listing)),
	);
}

/**
 * Atomically reserve capacity for each finite-capacity item. Rolls back all
 * reservations and returns the offending item name on failure.
 */
export async function reserveSlots(
	items: SlotRequest[],
	ttlSeconds: number,
	reservationId?: string,
): Promise<
	{ ok: true } | { ok: false; failedItemId: string; remaining: number }
> {
	const acquired: Array<{ id: string; qty: number }> = [];
	for (const item of items) {
		if (item.maxQuantity === null || item.maxQuantity === undefined)
			continue;
		const key = reservedKey(item.dailyOrderItemId);
		const reservedAfter = await Redis.incrby(key, item.quantity);
		await Redis.expire(key, ttlSeconds);
		if (reservationId) {
			const ownerKey = reservationKey(
				item.dailyOrderItemId,
				reservationId,
			);
			await Redis.incrby(ownerKey, item.quantity);
			await Redis.expire(ownerKey, ttlSeconds);
		}
		acquired.push({ id: item.dailyOrderItemId, qty: item.quantity });
		if (item.committed + reservedAfter > item.maxQuantity) {
			const reservedBefore = Math.max(0, reservedAfter - item.quantity);
			const remaining = Math.max(
				0,
				item.maxQuantity - item.committed - reservedBefore,
			);
			// Roll back this and every prior reservation.
			for (const a of acquired) {
				await decrReserved(a.id, a.qty, reservationId);
			}
			return {
				ok: false,
				failedItemId: item.dailyOrderItemId,
				remaining,
			};
		}
	}
	return { ok: true };
}

async function decrReserved(
	dailyOrderItemId: string,
	qty: number,
	reservationId?: string,
): Promise<void> {
	const key = reservedKey(dailyOrderItemId);
	const after = await Redis.decrby(key, qty);
	if (after < 0) await Redis.set(key, "0");
	if (reservationId) {
		const ownerKey = reservationKey(dailyOrderItemId, reservationId);
		const ownerAfter = await Redis.decrby(ownerKey, qty);
		if (ownerAfter <= 0) await Redis.del(ownerKey);
	}
}

/** Release holds for items (on abandon / cancel before payment). */
export async function releaseSlots(
	items: Array<{ dailyOrderItemId: string; quantity: number }>,
	reservationId?: string,
): Promise<void> {
	await Promise.allSettled(
		items.map((i) =>
			decrReserved(i.dailyOrderItemId, i.quantity, reservationId),
		),
	);
}

/**
 * Convert reservations to committed capacity on payment success: the listing's
 * orderedQuantity is incremented elsewhere; here we just drop the hold.
 */
export async function commitSlots(
	items: Array<{ dailyOrderItemId: string; quantity: number }>,
	reservationId?: string,
): Promise<void> {
	await releaseSlots(items, reservationId);
}
