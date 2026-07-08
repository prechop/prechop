// Small builders that assemble the domain graph (campus → user → vendor →
// menu items) so service tests can focus on behaviour, not setup.

import { generateShareableToken } from "@/server/constants/orderNumber";
import {
	createCampusDB,
	createDailyOrderDB,
	createMenuItemDB,
	createUserDB,
	createVendorProfileDB,
	DailyOrderStatus,
	MenuCategory,
	setDailyOrderStatusDB,
	setVendorStatusDB,
	updateVendorProfileDB,
	UserRole,
	VendorStatus,
} from "@/server/models";
import { oid, uniquePhone } from "./db";

export async function makeCampus(overrides: Record<string, unknown> = {}) {
	return createCampusDB({
		payload: {
			name: `Campus ${Math.random().toString(36).slice(2, 7)}`,
			shortCode: `C${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
			state: "Lagos",
			...overrides,
		},
	});
}

export async function makeUser({
	role = UserRole.BUYER,
	campusId,
	isPhoneVerified = true,
}: {
	role?: UserRole;
	campusId?: string;
	isPhoneVerified?: boolean;
} = {}) {
	return createUserDB({
		payload: {
			campusId: campusId ?? oid(),
			firstName: "Test",
			lastName: "User",
			phone: uniquePhone(),
			role,
			isPhoneVerified,
		},
	});
}

/** Create a VENDOR user + its vendor profile. Returns handy ids. */
export async function makeVendor({
	status = VendorStatus.ACTIVE,
	withSubaccount = false,
}: {
	status?: VendorStatus;
	withSubaccount?: boolean;
} = {}) {
	const campus = await makeCampus();
	const campusId = campus!._id.toString();
	const user = await makeUser({ role: UserRole.VENDOR, campusId });
	const userId = user!._id.toString();
	const profile = await createVendorProfileDB({
		payload: {
			userId,
			campusId,
			email: `v-${Math.random().toString(36).slice(2)}@prechop.test`,
			businessName: "Test Kitchen",
		},
	});
	const vendorId = profile!._id.toString();
	if (status !== VendorStatus.INCOMPLETE) {
		await setVendorStatusDB({ id: vendorId, status });
	}
	if (withSubaccount) {
		await updateVendorProfileDB({
			id: vendorId,
			payload: { paystackSubaccountCode: "ACCT_test" },
		});
	}
	return { userId, vendorId, campusId };
}

export async function makeMenuItem({
	vendorId,
	campusId,
	category = MenuCategory.MEALS,
	priceKobo = 150000,
	name = "Jollof",
}: {
	vendorId: string;
	campusId: string;
	category?: MenuCategory;
	priceKobo?: number;
	name?: string;
}) {
	return createMenuItemDB({
		payload: { vendorId, campusId, category, name, priceKobo },
	});
}

/** Create an ACTIVE daily order with a single finite-capacity item. */
export async function makeActiveDailyOrder({
	vendorId,
	campusId,
	maxQuantity = 10,
}: {
	vendorId: string;
	campusId: string;
	maxQuantity?: number | null;
}) {
	const listing = await createDailyOrderDB({
		payload: {
			vendorId,
			campusId,
			shareableToken: generateShareableToken(),
			title: "Lunch",
			scheduledDate: new Date(Date.now() + 3_600_000),
			cutoffTime: new Date(Date.now() + 1_800_000),
			pickupAvailable: true,
			items: [
				{
					menuItemId: oid(),
					snapshotName: "Jollof",
					snapshotPriceKobo: 150000,
					snapshotPrepMin: 20,
					maxQuantity,
				},
			],
		},
	});
	await setDailyOrderStatusDB({
		id: listing!._id.toString(),
		vendorId,
		status: DailyOrderStatus.ACTIVE,
	});
	return listing!;
}
