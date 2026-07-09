import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
	DayOfWeek,
	LocationType,
	MenuCategory,
	VendorStatus,
} from "@/server/models/enums";
import { getVendorProfileByIdDB } from "@/server/models/vendorProfiles";
import { resendProvider } from "@/server/providers/resend";
import {
	setMenuItemAvailability,
	setMenuItemSoldOut,
} from "@/server/services/menu/availability";
import { createMenuItem } from "@/server/services/menu/createMenu";
import { deleteMenuItem } from "@/server/services/menu/deleteMenu";
import { listMenu } from "@/server/services/menu/listMenu";
import { reorderMenu } from "@/server/services/menu/reorder";
import { updateMenuItem } from "@/server/services/menu/updateMenu";
import { invalidateSiteConfigsCache } from "@/server/services/siteConfigs/getSiteConfigs";
import { deleteTimetableEntry } from "@/server/services/timetable/deleteEntry";
import {
	upsertTimetableEntries,
	upsertTimetableEntry,
} from "@/server/services/timetable/upsertEntry";
import {
	getMyVendorProfile,
	resolveVendorByUserId,
	setCategories,
	setOpenStatus,
	updateBusinessIdentity,
	updateVendorLocation,
	vendorIdOf,
} from "@/server/services/vendors";
import { connectTestDB, dropAndDisconnect, oid } from "../helpers/db";
import { makeVendor } from "../helpers/factories";

beforeAll(async () => {
	await connectTestDB();
	invalidateSiteConfigsCache();
	vi.spyOn(resendProvider, "sendVendorWelcome").mockResolvedValue(
		undefined as never,
	);
	vi.spyOn(resendProvider, "sendVendorSubmissionReceived").mockResolvedValue(
		undefined as never,
	);
	vi.spyOn(resendProvider, "sendVendorApproved").mockResolvedValue(
		undefined as never,
	);
});

afterAll(async () => {
	vi.restoreAllMocks();
	await dropAndDisconnect();
});

describe("resolveVendor / getMyVendor", () => {
	it("resolves the vendor owned by a user", async () => {
		const { userId, vendorId } = await makeVendor();
		const vendor = await resolveVendorByUserId({ userId });
		expect(vendorIdOf(vendor)).toBe(vendorId);
		const mine = await getMyVendorProfile({ userId });
		expect(vendorIdOf(mine)).toBe(vendorId);
	});

	it("throws for a user with no vendor profile", async () => {
		await expect(
			resolveVendorByUserId({ userId: oid() }),
		).rejects.toThrow();
	});
});

describe("vendor onboarding services", () => {
	it("updates business identity, location, categories", async () => {
		const { userId, vendorId } = await makeVendor();
		await updateBusinessIdentity({
			userId,
			businessName: "New Name",
			email: `new-${oid()}@prechop.test`,
			description: "Best food",
		});
		await updateVendorLocation({
			userId,
			input: {
				locationType: LocationType.ON_CAMPUS,
				hostelOrStallName: "Block C",
			},
		});
		await setCategories({ userId, categories: [MenuCategory.MEALS] });

		const v = await getVendorProfileByIdDB({ id: vendorId });
		expect(v!.businessName).toBe("New Name");
		expect(v!.locationType).toBe(LocationType.ON_CAMPUS);
		expect(v!.categories).toContain(MenuCategory.MEALS);
	});

	it("rejects a duplicate email on business identity", async () => {
		const a = await makeVendor();
		const b = await makeVendor();
		const sharedEmail = `dup-${oid()}@prechop.test`;
		await updateBusinessIdentity({
			userId: a.userId,
			businessName: "A",
			email: sharedEmail,
		});
		await expect(
			updateBusinessIdentity({
				userId: b.userId,
				businessName: "B",
				email: sharedEmail,
			}),
		).rejects.toThrow(/already in use/i);
	});

	it("setOpenStatus requires an ACTIVE vendor", async () => {
		const active = await makeVendor({ status: VendorStatus.ACTIVE });
		const res = await setOpenStatus({
			userId: active.userId,
			isOpenForOrders: true,
		});
		expect(res.isOpenForOrders).toBe(true);

		const incomplete = await makeVendor({
			status: VendorStatus.INCOMPLETE,
		});
		await expect(
			setOpenStatus({
				userId: incomplete.userId,
				isOpenForOrders: true,
			}),
		).rejects.toThrow();
	});

	it("gates activation behind submit + admin approval (no auto-activate)", async () => {
		// Build a fully complete profile so recompute crosses the threshold.
		const { userId, vendorId, campusId } = await makeVendor({
			status: VendorStatus.INCOMPLETE,
		});
		// phone verified (makeUser default true), profile image, categories,
		// 3 menu items, timetable entry, bank subaccount.
		await setCategories({ userId, categories: [MenuCategory.MEALS] });
		const items = [];
		for (let i = 0; i < 3; i++) {
			const item = await createMenuItem({
				userId,
				name: `Item ${i}`,
				category: MenuCategory.MEALS,
				priceNaira: 500,
			});
			items.push(item);
		}
		await upsertTimetableEntry({
			userId,
			menuItemId: items[0]!._id.toString(),
			dayOfWeek: DayOfWeek.MONDAY,
			isOpen: true,
		});
		// give it profile image + bank so completeness hits 100
		const { updateVendorProfileDB } = await import(
			"@/server/models/vendorProfiles"
		);
		await updateVendorProfileDB({
			id: vendorId,
			payload: {
				profileImageUrl: "https://img.test/x.jpg",
				paystackSubaccountCode: "ACCT_x",
			},
		});
		const { recomputeVendorCompleteness } = await import(
			"@/server/services/vendors/recomputeVendorCompleteness"
		);
		// Completeness reaches 100 but the vendor stays INCOMPLETE — no auto-activate.
		const result = await recomputeVendorCompleteness({ vendorId, userId });
		expect(result.profileCompleteness).toBe(100);
		expect(result.status).toBe(VendorStatus.INCOMPLETE);

		// Vendor submits → PENDING_REVIEW (received email).
		const { submitVendorForReview } = await import(
			"@/server/services/vendors/submitForReview"
		);
		const submitted = await submitVendorForReview({ vendorId, userId });
		expect(submitted.status).toBe(VendorStatus.PENDING_REVIEW);
		expect(resendProvider.sendVendorSubmissionReceived).toHaveBeenCalled();

		// Admin approves → ACTIVE (approved email).
		const { approveVendor } = await import(
			"@/server/services/admin/onboarding"
		);
		const approved = await approveVendor({
			id: vendorId,
			actor: { userId: oid(), role: "Administrators" },
		});
		expect(approved.status).toBe(VendorStatus.ACTIVE);
		expect(resendProvider.sendVendorApproved).toHaveBeenCalled();
		void campusId;
	});
});

describe("menu services", () => {
	it("creates, updates, lists, toggles availability/soldOut, deletes", async () => {
		const { userId } = await makeVendor();
		const item = await createMenuItem({
			userId,
			name: "Rice",
			category: MenuCategory.MEALS,
			priceNaira: 500,
		});
		expect(item!.priceKobo).toBe(50000);
		const itemId = item!._id.toString();

		const updated = await updateMenuItem({
			userId,
			itemId,
			priceNaira: 750,
			name: "Fried Rice",
		});
		expect(updated.priceKobo).toBe(75000);
		expect(updated.name).toBe("Fried Rice");

		expect(
			(
				await setMenuItemAvailability({
					userId,
					itemId,
					isAvailable: false,
				})
			).isAvailable,
		).toBe(false);
		expect(
			(await setMenuItemSoldOut({ userId, itemId, isSoldOut: true }))
				.isSoldOut,
		).toBe(true);

		const list = await listMenu({ userId });
		expect(list.length).toBe(1);

		expect((await deleteMenuItem({ userId, itemId })).deleted).toBe(true);
	});

	it("update/delete of a foreign item throws not-found", async () => {
		const a = await makeVendor();
		const b = await makeVendor();
		const item = await createMenuItem({
			userId: a.userId,
			name: "X",
			category: MenuCategory.MEALS,
			priceNaira: 100,
		});
		await expect(
			updateMenuItem({
				userId: b.userId,
				itemId: item!._id.toString(),
				priceNaira: 1,
			}),
		).rejects.toThrow();
		await expect(
			deleteMenuItem({ userId: b.userId, itemId: item!._id.toString() }),
		).rejects.toThrow();
	});

	it("reorders owned items and rejects foreign ids", async () => {
		const { userId } = await makeVendor();
		const a = await createMenuItem({
			userId,
			name: "A",
			category: MenuCategory.MEALS,
			priceNaira: 100,
		});
		const b = await createMenuItem({
			userId,
			name: "B",
			category: MenuCategory.MEALS,
			priceNaira: 200,
		});
		const res = await reorderMenu({
			userId,
			items: [
				{ id: a!._id.toString(), displayOrder: 1 },
				{ id: b!._id.toString(), displayOrder: 0 },
			],
		});
		expect(res.updated).toBe(2);

		await expect(
			reorderMenu({
				userId,
				items: [{ id: oid(), displayOrder: 0 }],
			}),
		).rejects.toThrow();
	});
});

describe("timetable services", () => {
	it("upserts entries for owned items and deletes them", async () => {
		const { userId } = await makeVendor();
		const item = await createMenuItem({
			userId,
			name: "A",
			category: MenuCategory.MEALS,
			priceNaira: 100,
		});
		const entries = await upsertTimetableEntries({
			userId,
			entries: [
				{
					menuItemId: item!._id.toString(),
					dayOfWeek: DayOfWeek.MONDAY,
					isOpen: true,
				},
				{
					menuItemId: item!._id.toString(),
					dayOfWeek: DayOfWeek.TUESDAY,
					isOpen: false,
				},
			],
		});
		expect(entries.length).toBe(2);
		expect(
			await deleteTimetableEntry({
				userId,
				id: entries[0]!._id.toString(),
			}),
		).toEqual({ deleted: true });
	});

	it("rejects timetable entries for foreign menu items", async () => {
		const { userId } = await makeVendor();
		await expect(
			upsertTimetableEntry({
				userId,
				menuItemId: oid(),
				dayOfWeek: DayOfWeek.MONDAY,
				isOpen: true,
			}),
		).rejects.toThrow();
	});
});
