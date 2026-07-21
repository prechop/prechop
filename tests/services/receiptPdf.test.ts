// Receipts are the buyer's proof of a finished transaction, and the download
// path hands out a signed S3 credential. Both matter, and neither had coverage.
//
// What is mocked and why: ONLY the two network edges — S3 and Resend. The order
// lives in the real scratch Mongo and the PDF is rendered for real, so these
// tests exercise the actual `generateReceiptPdf` → upload → email orchestration
// rather than a hall of mirrors. Mocking `generateReceiptPdf` itself would mock
// the thing under test.

import mongoose from "mongoose";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

// `vi.mock` is hoisted above every `const`, so the doubles must be created in a
// `vi.hoisted` block or the factory closes over uninitialised bindings.
const { uploadBuffer, objectExists, getPresignedReadUrl, sendReceiptEmail } =
	vi.hoisted(() => ({
		// Typed with the full signature so `mock.calls[0][2]` (the buffer) is
		// reachable without casts — the buffer is the whole point of the test.
		uploadBuffer: vi.fn(
			async (
				_prefix: string,
				filename: string,
				_body: Buffer,
				_contentType: string,
			) => `receipts/${filename}`,
		),
		objectExists: vi.fn(async () => true),
		getPresignedReadUrl: vi.fn(
			async (key: string, ttl?: number) =>
				`https://s3.test/${key}?X-Amz-Expires=${ttl ?? 0}`,
		),
		sendReceiptEmail: vi.fn(
			async (_input: {
				to: string;
				buyerName: string;
				orderNumber: string;
				vendorName: string;
				receiptPdfBuffer: Buffer;
			}) => {},
		),
	}));

vi.mock("@/server/providers", async (importOriginal) => {
	const actual = await importOriginal<Record<string, unknown>>();
	return {
		...actual,
		s3Provider: { uploadBuffer, objectExists, getPresignedReadUrl },
		resendProvider: { sendReceiptEmail },
	};
});

import {
	createUserDB,
	getBuyerOrderByIdDB,
	OrderStatus,
} from "@/server/models";
import { createBuyerOrderDB } from "@/server/models/buyerOrders";
import {
	generateAndStoreReceipt,
	generateReceiptInBackground,
	getReceiptDownloadUrl,
	isReceiptEligible,
	receiptObjectKey,
} from "@/server/services/buyerOrders/receiptPdf";
import {
	connectTestDB,
	dropAndDisconnect,
	oid,
	uniquePhone,
} from "../helpers/db";
import { makeVendor, seedTestIam } from "../helpers/factories";

let buyerId: string;
let vendorId: string;
let campusId: string;
const buyerEmail = "buyer@receipts.test";

beforeAll(async () => {
	await connectTestDB();
	await seedTestIam();
	const vendor = await makeVendor();
	vendorId = vendor.vendorId;
	campusId = vendor.campusId;
	const buyer = await createUserDB({
		payload: {
			email: buyerEmail,
			campusId: vendor.campusId,
			firstName: "Ada",
			lastName: "Buyer",
			phone: uniquePhone(),
			groupIds: [],
		},
	});
	buyerId = buyer!._id.toString();
});

afterAll(async () => {
	await dropAndDisconnect();
});

beforeEach(() => {
	uploadBuffer.mockClear();
	objectExists.mockClear();
	getPresignedReadUrl.mockClear();
	sendReceiptEmail.mockClear();
	objectExists.mockResolvedValue(true);
});

afterEach(() => {
	vi.restoreAllMocks();
});

async function makeOrder(status: OrderStatus, buyer = buyerId) {
	const order = await createBuyerOrderDB({
		payload: {
			// The model takes id STRINGS, not ObjectIds.
			buyerId: buyer,
			vendorId,
			campusId,
			dailyOrderId: oid(),
			orderNumber: `PC-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
			status,
			fulfillmentType: "PICKUP",
			items: [
				{
					menuItemId: oid(),
					snapshotName: "Jollof",
					snapshotPriceKobo: 150_000,
					quantity: 2,
					subtotalKobo: 300_000,
				},
			],
			subtotalKobo: 300_000,
			deliveryFeeKobo: 0,
			platformFeeKobo: 9_000,
			paymentProcessingFeeKobo: 9_000,
			prechopCommissionKobo: 24_000,
			totalKobo: 309_000,
		} as never,
	});
	if (!order) throw new Error("fixture: createBuyerOrderDB returned null");
	return order;
}

describe("receiptObjectKey", () => {
	it("derives a stable key from the order id", () => {
		expect(receiptObjectKey("abc123")).toBe("receipts/order-abc123.pdf");
	});

	it("is deterministic — a retry overwrites rather than orphaning a second PDF", () => {
		expect(receiptObjectKey("abc123")).toBe(receiptObjectKey("abc123"));
	});

	it("gives different orders different keys", () => {
		expect(receiptObjectKey("a")).not.toBe(receiptObjectKey("b"));
	});
});

describe("isReceiptEligible", () => {
	it("is true only for COMPLETED", () => {
		expect(isReceiptEligible(OrderStatus.COMPLETED)).toBe(true);
	});

	it.each([
		OrderStatus.PENDING_PAYMENT,
		OrderStatus.AWAITING_EXTERNAL_PAYMENT,
		OrderStatus.CANCELLED,
	])("is false for %s — a receipt is proof of a FINISHED transaction", (status) => {
		expect(isReceiptEligible(status)).toBe(false);
	});
});

describe("generateAndStoreReceipt", () => {
	it("renders a real PDF and stores it under the derived key", async () => {
		const order = await makeOrder(OrderStatus.COMPLETED);
		const key = await generateAndStoreReceipt({
			orderId: order._id.toString(),
			email: false,
		});

		expect(key).toBe(`receipts/order-${order._id.toString()}.pdf`);
		expect(uploadBuffer).toHaveBeenCalledTimes(1);

		// The buffer is a genuine PDF, not a stub: %PDF- magic bytes and a
		// non-trivial size. This is what proves generateReceiptPdf actually ran.
		const [prefix, filename, buffer, contentType] =
			uploadBuffer.mock.calls[0];
		expect(prefix).toBe("receipts");
		expect(filename).toBe(`order-${order._id.toString()}.pdf`);
		expect(contentType).toBe("application/pdf");
		expect(Buffer.isBuffer(buffer)).toBe(true);
		expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
		expect(buffer.length).toBeGreaterThan(500);
	});

	it("emails the stored PDF to a buyer who HAS an email", async () => {
		// The buyer's email must be written through the raw driver: the User
		// mongoose schema has NO `email` path (only the `IUser` *interface*
		// claims `email: string`), so mongoose strips it. See the test below —
		// this branch is currently unreachable in production.
		await mongoose.connection
			.db!.collection("users")
			.updateOne(
				{ _id: new mongoose.Types.ObjectId(buyerId) },
				{ $set: { email: buyerEmail } },
			);
		const order = await makeOrder(OrderStatus.COMPLETED);

		await generateAndStoreReceipt({ orderId: order._id.toString() });

		expect(sendReceiptEmail).toHaveBeenCalledTimes(1);
		const emailArg = sendReceiptEmail.mock.calls[0][0];
		expect(emailArg.to).toBe(buyerEmail);
		expect(emailArg.orderNumber).toBe(order.orderNumber);
		expect(emailArg.buyerName).toBe("Ada Buyer");
		// The emailed PDF is the same one that was stored.
		const stored = uploadBuffer.mock.calls[0][2];
		expect(emailArg.receiptPdfBuffer.equals(stored)).toBe(true);

		await mongoose.connection
			.db!.collection("users")
			.updateOne(
				{ _id: new mongoose.Types.ObjectId(buyerId) },
				{ $unset: { email: "" } },
			);
	});

	it("BUG GUARD: stores the PDF but sends NO email when the buyer has no email", async () => {
		// This is every buyer in production today. `IUserCreateInput` has no
		// `email`, `updateUserProfileDB` cannot set one, and the User schema has
		// no `email` path at all — verified against the live DB: 0 of 16 users
		// have the field. So `buyer?.email ?? ""` is always "", `if (email &&
		// buyerEmail)` is always false, and the receipt email silently never
		// sends while `generateAndStoreReceipt` still reports success.
		//
		// This test pins that reality so it cannot be mistaken for working. When
		// the product bug is fixed (user emails captured), this test SHOULD fail
		// and be replaced by the one above — that failure is the signal.
		const order = await makeOrder(OrderStatus.COMPLETED);

		const key = await generateAndStoreReceipt({
			orderId: order._id.toString(),
		});

		expect(key).toBeTruthy();
		expect(uploadBuffer).toHaveBeenCalledTimes(1);
		expect(sendReceiptEmail).not.toHaveBeenCalled();
	});

	it("returns null and stores nothing for an order that is not COMPLETED", async () => {
		const order = await makeOrder(OrderStatus.PENDING_PAYMENT);
		await expect(
			generateAndStoreReceipt({ orderId: order._id.toString() }),
		).resolves.toBeNull();
		expect(uploadBuffer).not.toHaveBeenCalled();
		expect(sendReceiptEmail).not.toHaveBeenCalled();
	});

	it("throws for an order that does not exist", async () => {
		await expect(
			generateAndStoreReceipt({ orderId: oid() }),
		).rejects.toThrow();
		expect(uploadBuffer).not.toHaveBeenCalled();
	});

	it("skips the email when email:false", async () => {
		const order = await makeOrder(OrderStatus.COMPLETED);
		await generateAndStoreReceipt({
			orderId: order._id.toString(),
			email: false,
		});
		expect(uploadBuffer).toHaveBeenCalledTimes(1);
		expect(sendReceiptEmail).not.toHaveBeenCalled();
	});

	it("still returns the key when the email bounces — the PDF is already durable", async () => {
		const order = await makeOrder(OrderStatus.COMPLETED);
		sendReceiptEmail.mockRejectedValueOnce(new Error("resend 500"));
		vi.spyOn(console, "error").mockImplementation(() => {});

		// A failed email must not fail the receipt: the object is already stored.
		await expect(
			generateAndStoreReceipt({ orderId: order._id.toString() }),
		).resolves.toBe(`receipts/order-${order._id.toString()}.pdf`);
	});

	it("propagates an upload failure — a receipt that was never stored is not a receipt", async () => {
		const order = await makeOrder(OrderStatus.COMPLETED);
		uploadBuffer.mockRejectedValueOnce(new Error("s3 down"));
		await expect(
			generateAndStoreReceipt({ orderId: order._id.toString() }),
		).rejects.toThrow(/s3 down/);
	});

	it("is idempotent — a re-run targets the same key", async () => {
		const order = await makeOrder(OrderStatus.COMPLETED);
		const first = await generateAndStoreReceipt({
			orderId: order._id.toString(),
			email: false,
		});
		const second = await generateAndStoreReceipt({
			orderId: order._id.toString(),
			email: false,
		});
		expect(second).toBe(first);
		expect(uploadBuffer.mock.calls[0][1]).toBe(
			uploadBuffer.mock.calls[1][1],
		);
	});
});

describe("getReceiptDownloadUrl", () => {
	it("signs a short-lived URL for an existing object without re-rendering", async () => {
		const order = await makeOrder(OrderStatus.COMPLETED);
		const url = await getReceiptDownloadUrl({
			orderId: order._id.toString(),
			order: order as never,
		});

		expect(url).toContain(`receipts/order-${order._id.toString()}.pdf`);
		// 5 minutes: a signed URL is a bearer credential, so the TTL is the
		// blast radius of a leaked link.
		expect(getPresignedReadUrl).toHaveBeenCalledWith(
			`receipts/order-${order._id.toString()}.pdf`,
			300,
		);
		expect(uploadBuffer).not.toHaveBeenCalled();
	});

	it("self-heals: renders on demand when the object is missing", async () => {
		const order = await makeOrder(OrderStatus.COMPLETED);
		objectExists.mockResolvedValueOnce(false);

		const url = await getReceiptDownloadUrl({
			orderId: order._id.toString(),
			order: order as never,
		});

		// Generated synchronously, and WITHOUT re-emailing the buyer — they are
		// already looking at it.
		expect(uploadBuffer).toHaveBeenCalledTimes(1);
		expect(sendReceiptEmail).not.toHaveBeenCalled();
		expect(url).toContain("X-Amz-Expires=300");
	});

	it("refuses a receipt for an order that is not COMPLETED", async () => {
		const order = await makeOrder(OrderStatus.PENDING_PAYMENT);
		await expect(
			getReceiptDownloadUrl({
				orderId: order._id.toString(),
				order: order as never,
			}),
		).rejects.toThrow();
		expect(getPresignedReadUrl).not.toHaveBeenCalled();
	});
});

describe("generateReceiptInBackground", () => {
	// The background job is fire-and-forget, so poll the persisted receiptStatus.
	async function waitForReceiptStatus(
		orderId: string,
		timeoutMs = 3000,
	): Promise<string | undefined> {
		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline) {
			const order = await getBuyerOrderByIdDB({ id: orderId });
			// PENDING is written first, then the terminal READY/FAILED — wait for
			// the terminal state, not the transient PENDING.
			if (
				order?.receiptStatus === "READY" ||
				order?.receiptStatus === "FAILED"
			)
				return order.receiptStatus;
			await new Promise((r) => setTimeout(r, 25));
		}
		const order = await getBuyerOrderByIdDB({ id: orderId });
		return order?.receiptStatus;
	}

	it("never throws, even when generation fails", async () => {
		const errorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		// A receipt failure must not roll back the vendor's COMPLETED transition.
		expect(() => generateReceiptInBackground(oid())).not.toThrow();
		await new Promise((r) => setTimeout(r, 50));
		expect(errorSpy).toHaveBeenCalledWith(
			expect.stringContaining("background generation failed"),
			expect.anything(),
		);
	});

	it("transitions PENDING → READY on a successful render", async () => {
		const order = await makeOrder(OrderStatus.COMPLETED);
		generateReceiptInBackground(order._id.toString());
		const status = await waitForReceiptStatus(order._id.toString());
		expect(status).toBe("READY");
	});

	it("transitions to FAILED when the upload throws", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		uploadBuffer.mockRejectedValueOnce(new Error("s3 down"));
		const order = await makeOrder(OrderStatus.COMPLETED);

		generateReceiptInBackground(order._id.toString());
		const status = await waitForReceiptStatus(order._id.toString());
		// The order LEAVES pending — a stuck-on-PENDING order spins the UI forever.
		expect(status).toBe("FAILED");
	});

	it("never strands a non-eligible order on PENDING", async () => {
		// A non-COMPLETED order must keep its absent receiptStatus — the check is
		// settled BEFORE the PENDING write, so nothing writes PENDING and nothing
		// is left to clear it.
		const order = await makeOrder(OrderStatus.PENDING_PAYMENT);
		generateReceiptInBackground(order._id.toString());
		await new Promise((r) => setTimeout(r, 200));

		const fresh = await getBuyerOrderByIdDB({ id: order._id.toString() });
		expect(fresh?.receiptStatus).toBeFalsy();
		// And it certainly never stored a PDF.
		expect(uploadBuffer).not.toHaveBeenCalled();
	});
});
