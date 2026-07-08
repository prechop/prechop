import mongoose from "mongoose";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { Redis } from "@/server/databases/redis";
import {
	commitSlots,
	releaseSlots,
	reserveSlots,
	type SlotRequest,
} from "@/server/services/buyerOrders/slots";

const TTL = 60;
const usedIds: string[] = [];

function itemId(): string {
	const id = new mongoose.Types.ObjectId().toString();
	usedIds.push(id);
	return id;
}

afterEach(async () => {
	// Clean only the reservation keys this suite created.
	if (usedIds.length) {
		await Redis.del(...usedIds.map((id) => `slot:reserved:${id}`));
	}
});

afterAll(async () => {
	await Redis.del(...usedIds.map((id) => `slot:reserved:${id}`));
});

describe("reserveSlots", () => {
	it("reserves within capacity", async () => {
		const req: SlotRequest = {
			dailyOrderItemId: itemId(),
			quantity: 3,
			committed: 0,
			maxQuantity: 10,
		};
		const res = await reserveSlots([req], TTL);
		expect(res.ok).toBe(true);
		expect(await Redis.get(`slot:reserved:${req.dailyOrderItemId}`)).toBe(
			"3",
		);
	});

	it("ignores items with unlimited capacity (no counter created)", async () => {
		const id = itemId();
		const res = await reserveSlots(
			[
				{
					dailyOrderItemId: id,
					quantity: 5,
					committed: 0,
					maxQuantity: null,
				},
			],
			TTL,
		);
		expect(res.ok).toBe(true);
		expect(await Redis.get(`slot:reserved:${id}`)).toBeNull();
	});

	it("blocks oversell counting committed + reserved against maxQuantity", async () => {
		const id = itemId();
		// committed 8 of 10, request 3 → 11 > 10 → blocked
		const res = await reserveSlots(
			[
				{
					dailyOrderItemId: id,
					quantity: 3,
					committed: 8,
					maxQuantity: 10,
				},
			],
			TTL,
		);
		expect(res.ok).toBe(false);
		if (!res.ok) expect(res.failedItemId).toBe(id);
		// reservation rolled back to 0
		expect(await Redis.get(`slot:reserved:${id}`)).toBe("0");
	});

	it("rolls back earlier reservations when a later item oversells", async () => {
		const a = itemId();
		const b = itemId();
		const res = await reserveSlots(
			[
				{
					dailyOrderItemId: a,
					quantity: 2,
					committed: 0,
					maxQuantity: 10,
				},
				{
					dailyOrderItemId: b,
					quantity: 5,
					committed: 8,
					maxQuantity: 10,
				},
			],
			TTL,
		);
		expect(res.ok).toBe(false);
		// both a and b rolled back
		expect(await Redis.get(`slot:reserved:${a}`)).toBe("0");
		expect(await Redis.get(`slot:reserved:${b}`)).toBe("0");
	});

	it("lets two concurrent buyers race for the last slot with only one winning", async () => {
		const id = itemId();
		const req: SlotRequest = {
			dailyOrderItemId: id,
			quantity: 1,
			committed: 9,
			maxQuantity: 10,
		};
		const [r1, r2] = await Promise.all([
			reserveSlots([{ ...req }], TTL),
			reserveSlots([{ ...req }], TTL),
		]);
		const winners = [r1, r2].filter((r) => r.ok).length;
		expect(winners).toBe(1);
	});
});

describe("releaseSlots / commitSlots", () => {
	it("releaseSlots decrements the hold", async () => {
		const id = itemId();
		await reserveSlots(
			[
				{
					dailyOrderItemId: id,
					quantity: 4,
					committed: 0,
					maxQuantity: 10,
				},
			],
			TTL,
		);
		await releaseSlots([{ dailyOrderItemId: id, quantity: 4 }]);
		expect(await Redis.get(`slot:reserved:${id}`)).toBe("0");
	});

	it("never lets the counter go negative", async () => {
		const id = itemId();
		await releaseSlots([{ dailyOrderItemId: id, quantity: 5 }]);
		expect(Number(await Redis.get(`slot:reserved:${id}`))).toBeGreaterThanOrEqual(
			0,
		);
	});

	it("commitSlots drops the hold (alias of releaseSlots)", async () => {
		const id = itemId();
		await reserveSlots(
			[
				{
					dailyOrderItemId: id,
					quantity: 2,
					committed: 0,
					maxQuantity: 5,
				},
			],
			TTL,
		);
		await commitSlots([{ dailyOrderItemId: id, quantity: 2 }]);
		expect(await Redis.get(`slot:reserved:${id}`)).toBe("0");
	});
});
