import { Redis } from "../../databases";

// Oversell protection. Each daily-order item with a finite `maxQuantity` has a
// Redis reservation counter tracking quantity held by orders that are still in
// PENDING_PAYMENT. Availability = maxQuantity − committed(orderedQuantity) −
// reserved. Reservations use atomic INCRBY so concurrent buyers can't both slip
// past the same last slot; the hold auto-expires after the configured TTL.

function reservedKey(dailyOrderItemId: string): string {
	return `slot:reserved:${dailyOrderItemId}`;
}

export interface SlotRequest {
	dailyOrderItemId: string;
	quantity: number;
	committed: number; // orderedQuantity snapshot from the listing
	maxQuantity: number | null | undefined;
}

/**
 * Atomically reserve capacity for each finite-capacity item. Rolls back all
 * reservations and returns the offending item name on failure.
 */
export async function reserveSlots(
	items: SlotRequest[],
	ttlSeconds: number,
): Promise<{ ok: true } | { ok: false; failedItemId: string }> {
	const acquired: Array<{ id: string; qty: number }> = [];
	for (const item of items) {
		if (item.maxQuantity === null || item.maxQuantity === undefined)
			continue;
		const key = reservedKey(item.dailyOrderItemId);
		const reservedAfter = await Redis.incrby(key, item.quantity);
		await Redis.expire(key, ttlSeconds);
		acquired.push({ id: item.dailyOrderItemId, qty: item.quantity });
		if (item.committed + reservedAfter > item.maxQuantity) {
			// Roll back this and every prior reservation.
			for (const a of acquired) {
				await decrReserved(a.id, a.qty);
			}
			return { ok: false, failedItemId: item.dailyOrderItemId };
		}
	}
	return { ok: true };
}

async function decrReserved(
	dailyOrderItemId: string,
	qty: number,
): Promise<void> {
	const key = reservedKey(dailyOrderItemId);
	const after = await Redis.decrby(key, qty);
	if (after < 0) await Redis.set(key, "0");
}

/** Release holds for items (on abandon / cancel before payment). */
export async function releaseSlots(
	items: Array<{ dailyOrderItemId: string; quantity: number }>,
): Promise<void> {
	await Promise.allSettled(
		items.map((i) => decrReserved(i.dailyOrderItemId, i.quantity)),
	);
}

/**
 * Convert reservations to committed capacity on payment success: the listing's
 * orderedQuantity is incremented elsewhere; here we just drop the hold.
 */
export async function commitSlots(
	items: Array<{ dailyOrderItemId: string; quantity: number }>,
): Promise<void> {
	await releaseSlots(items);
}
