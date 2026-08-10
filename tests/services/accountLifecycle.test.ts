import { afterAll, beforeAll, describe, expect, it } from "vitest";
import hash from "@/server/constants/hash";
import { generateOrderNumber } from "@/server/constants/orderNumber";
import { BUYERS_GROUP, VENDORS_GROUP } from "@/server/constants/permissions";
import {
	addUserToGroupDB,
	createBuyerOrderDB,
	createOrderDisputeDB,
	createPaymentDB,
	createRefundDB,
	DailyOrderStatus,
	FulfillmentType,
	getBuyerOrderByIdDB,
	getUserByIdDB,
	getVendorProfileByUserIdDB,
	listDailyOrdersByVendorDB,
	OrderStatus,
	PaymentStatus,
	User,
} from "@/server/models";
import { getBuiltInGroupId } from "@/server/services/iam";
import {
	DELETE_ACCOUNT_CONFIRMATION,
	deactivateAccount,
} from "@/server/services/users/deactivateAccount";
import {
	CLOSE_VENDOR_CONFIRMATION,
	closeVendorProfile,
} from "@/server/services/vendors/closeProfile";
import { connectTestDB, dropAndDisconnect, oid } from "../helpers/db";
import {
	makeActiveDailyOrder,
	makeUser,
	makeVendor,
	seedTestIam,
} from "../helpers/factories";

beforeAll(async () => {
	await connectTestDB();
	await seedTestIam();
});

afterAll(async () => {
	await dropAndDisconnect();
});

async function attachBuyerAndVendorGroups(userId: string) {
	const buyerGroupId = await getBuiltInGroupId(BUYERS_GROUP);
	const vendorGroupId = await getBuiltInGroupId(VENDORS_GROUP);
	if (!buyerGroupId || !vendorGroupId)
		throw new Error("IAM groups not seeded");
	await addUserToGroupDB({ id: userId, groupId: buyerGroupId });
	await addUserToGroupDB({ id: userId, groupId: vendorGroupId });
	return { buyerGroupId, vendorGroupId };
}

async function makeOrder({
	vendorId,
	buyerId,
	campusId,
	status,
}: {
	vendorId: string;
	buyerId: string;
	campusId: string;
	status: OrderStatus;
}) {
	return createBuyerOrderDB({
		payload: {
			orderNumber: generateOrderNumber(),
			dailyOrderId: oid(),
			vendorId,
			buyerId,
			campusId,
			status,
			fulfillmentType: FulfillmentType.PICKUP,
			subtotalKobo: 150_000,
			deliveryFeeKobo: 0,
			platformFeeKobo: 5_000,
			totalKobo: 155_000,
			items: [
				{
					dailyOrderItemId: oid(),
					menuItemId: oid(),
					snapshotName: "Jollof",
					snapshotPriceKobo: 150_000,
					quantity: 1,
					subtotalKobo: 150_000,
					selectedOptions: [],
				},
			],
		},
	});
}

describe("vendor profile closure", () => {
	it("closes the business side and listings while preserving the buyer account", async () => {
		const { userId, vendorId, campusId } = await makeVendor();
		const { buyerGroupId, vendorGroupId } =
			await attachBuyerAndVendorGroups(userId);
		await makeActiveDailyOrder({ vendorId, campusId });

		const result = await closeVendorProfile({
			userId,
			confirmation: CLOSE_VENDOR_CONFIRMATION,
		});
		expect(result).toEqual({
			vendorProfileClosed: true,
			buyerAccountActive: true,
		});

		const user = await getUserByIdDB({ id: userId });
		expect(user?.isActive).toBe(true);
		expect(user?.groupIds.map(String)).toContain(buyerGroupId);
		expect(user?.groupIds.map(String)).not.toContain(vendorGroupId);
		expect(await getVendorProfileByUserIdDB({ userId })).toBeNull();
		const closedListings = await listDailyOrdersByVendorDB({
			vendorId,
			status: DailyOrderStatus.CLOSED,
		});
		expect(closedListings).toHaveLength(1);
	});

	it("blocks closure while orders, payments, refunds, or disputes are unresolved", async () => {
		const { userId, vendorId, campusId } = await makeVendor();
		await attachBuyerAndVendorGroups(userId);
		const buyerId = oid();
		const order = await makeOrder({
			vendorId,
			buyerId,
			campusId,
			status: OrderStatus.REFUND_PENDING,
		});
		const payment = await createPaymentDB({
			payload: {
				buyerOrderId: order!._id.toString(),
				buyerId,
				vendorId,
				paystackRef: `ref-${oid()}`,
				amountKobo: 155_000,
				platformFeeKobo: 5_000,
				vendorAmountKobo: 150_000,
				idempotencyKey: hash(oid()),
				status: PaymentStatus.INITIALIZED,
			},
		});
		await createRefundDB({
			payload: {
				paymentId: payment!._id.toString(),
				amountKobo: 155_000,
				reason: "Test unresolved refund",
				status: "REFUND_PENDING",
			},
		});
		await createOrderDisputeDB({
			payload: {
				buyerOrderId: order!._id.toString(),
				buyerId,
				vendorId,
				reason: "REFUND_FAILURE",
				evidence: {},
			},
		});

		await expect(
			closeVendorProfile({
				userId,
				confirmation: CLOSE_VENDOR_CONFIRMATION,
			}),
		).rejects.toMatchObject({ appCode: "VENDOR_CLOSURE_BLOCKED" });
		expect(await getVendorProfileByUserIdDB({ userId })).not.toBeNull();
	});
});

describe("whole Prechop account deletion", () => {
	it("deactivates buyer and vendor access but preserves completed history", async () => {
		const { userId, vendorId, campusId } = await makeVendor();
		await attachBuyerAndVendorGroups(userId);
		const user = await getUserByIdDB({ id: userId });
		const historical = await makeOrder({
			vendorId,
			buyerId: userId,
			campusId,
			status: OrderStatus.COMPLETED,
		});

		const result = await deactivateAccount({
			userId,
			accountIdentifier: user!.email,
			confirmation: DELETE_ACCOUNT_CONFIRMATION,
			authenticatedAt: new Date(),
		});
		expect(result.success).toBe(true);
		expect((await getUserByIdDB({ id: userId }))?.isActive).toBe(false);
		expect(await getVendorProfileByUserIdDB({ userId })).toBeNull();
		expect(
			await getBuyerOrderByIdDB({ id: historical!._id.toString() }),
		).not.toBeNull();
		const raw = await User.findById(userId).select("+refreshTokens").lean();
		expect(raw?.refreshTokens).toEqual([]);
	});

	it("requires a recent authenticated session and exact confirmation", async () => {
		const user = await makeUser();
		await expect(
			deactivateAccount({
				userId: user!._id.toString(),
				accountIdentifier: user!.email,
				confirmation: DELETE_ACCOUNT_CONFIRMATION,
				authenticatedAt: new Date(Date.now() - 11 * 60 * 1000),
			}),
		).rejects.toMatchObject({ appCode: "RECENT_AUTHENTICATION_REQUIRED" });
		await expect(
			deactivateAccount({
				userId: user!._id.toString(),
				accountIdentifier: user!.email,
				confirmation: "DELETE",
				authenticatedAt: new Date(),
			}),
		).rejects.toMatchObject({
			appCode: "DELETE_ACCOUNT_CONFIRMATION_REQUIRED",
		});
	});

	it("blocks deletion while the buyer has an unresolved order", async () => {
		const buyer = await makeUser();
		const { vendorId, campusId } = await makeVendor();
		await makeOrder({
			vendorId,
			buyerId: buyer!._id.toString(),
			campusId,
			status: OrderStatus.ACCEPTED,
		});
		await expect(
			deactivateAccount({
				userId: buyer!._id.toString(),
				accountIdentifier: buyer!.email,
				confirmation: DELETE_ACCOUNT_CONFIRMATION,
				authenticatedAt: new Date(),
			}),
		).rejects.toMatchObject({ appCode: "ACCOUNT_DELETION_BLOCKED" });
		expect(
			(await getUserByIdDB({ id: buyer!._id.toString() }))?.isActive,
		).toBe(true);
	});
});
