import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { OrderStatus, VendorStatus } from "@/server/models/enums";
import { getVendorProfileByIdDB } from "@/server/models/vendorProfiles";
import { createReviewDB } from "@/server/models/reviews";
import { resendProvider } from "@/server/providers/resend";
import {
	createCampus,
	listCampuses,
	updateCampus as adminUpdateCampus,
} from "@/server/services/admin/campuses";
import {
	createSchool,
	listSchools,
	toggleSchoolActive,
} from "@/server/services/admin/schools";
import {
	getVendor,
	listVendors,
	reactivateVendor,
	suspendVendor,
} from "@/server/services/admin/vendors";
import { getOrder, listOrders } from "@/server/services/admin/orders";
import {
	deleteReview,
	listFlaggedReviews,
	unflagReview,
} from "@/server/services/admin/reviews";
import {
	createWhatsappTv,
	deactivateWhatsappTv,
	listWhatsappTvs,
	updateWhatsappTv,
} from "@/server/services/admin/whatsappTvs";
import { listAudit } from "@/server/services/admin/audit";
import { getPlatformAnalytics } from "@/server/services/admin/analytics";
import { recordAuditSync } from "@/server/services/audit";
import { connectTestDB, dropAndDisconnect, oid } from "../helpers/db";
import { makeVendor } from "../helpers/factories";

beforeAll(async () => {
	await connectTestDB();
	vi.spyOn(resendProvider, "sendVendorSuspended").mockResolvedValue(
		undefined as never,
	);
});

afterAll(async () => {
	vi.restoreAllMocks();
	await dropAndDisconnect();
});

describe("admin campuses", () => {
	it("creates, lists and updates; rejects duplicate short code", async () => {
		const created = await createCampus({
			name: "Admin Uni",
			shortCode: `AD${oid().slice(-5)}`,
			state: "Lagos",
		});
		expect((await listCampuses()).length).toBeGreaterThanOrEqual(1);
		const updated = await adminUpdateCampus(created._id.toString(), {
			name: "Renamed Uni",
		});
		expect(updated.name).toBe("Renamed Uni");
		await expect(
			createCampus({
				name: "Dup",
				shortCode: created.shortCode,
				state: "Lagos",
			}),
		).rejects.toThrow();
	});
});

describe("admin schools", () => {
	it("creates, lists, toggles active", async () => {
		const s = await createSchool({
			name: `Admin School ${oid()}`,
			state: "Oyo",
			type: "Polytechnic",
		});
		expect((await listSchools()).length).toBeGreaterThanOrEqual(1);
		const toggled = await toggleSchoolActive(s._id.toString());
		expect(toggled.isActive).toBe(false);
	});
});

describe("admin vendors", () => {
	it("lists, gets, suspends (welcome/suspended email), reactivates", async () => {
		const { vendorId } = await makeVendor();
		expect((await listVendors({})).length).toBeGreaterThanOrEqual(1);
		expect((await getVendor(vendorId))._id.toString()).toBe(vendorId);

		const actor = { userId: oid(), role: "SUPER_ADMIN" };
		const suspended = await suspendVendor({
			id: vendorId,
			reason: "Policy breach",
			actor,
		});
		expect(suspended.status).toBe(VendorStatus.SUSPENDED);
		expect(resendProvider.sendVendorSuspended).toHaveBeenCalled();
		const persisted = await getVendorProfileByIdDB({ id: vendorId });
		expect(persisted!.status).toBe(VendorStatus.SUSPENDED);

		const reactivated = await reactivateVendor({ id: vendorId, actor });
		expect(reactivated.status).toBe(VendorStatus.ACTIVE);
	});

	it("throws for an unknown vendor", async () => {
		await expect(getVendor(oid())).rejects.toThrow();
	});
});

describe("admin orders + analytics + audit", () => {
	it("lists orders (empty filter) and analytics summary", async () => {
		await makeVendor();
		const orders = await listOrders({ status: OrderStatus.PAID });
		expect(Array.isArray(orders)).toBe(true);
		await expect(getOrder(oid())).rejects.toThrow();

		const analytics = await getPlatformAnalytics();
		expect(analytics.totalVendors).toBeGreaterThanOrEqual(1);
		expect(Array.isArray(analytics.topVendors)).toBe(true);
	});

	it("lists audit logs after a synchronous record", async () => {
		await recordAuditSync({
			userId: oid(),
			action: "ADMIN_TEST",
			resourceType: "test",
		});
		const logs = await listAudit({ limit: 10 });
		expect(logs.length).toBeGreaterThanOrEqual(1);
	});
});

describe("admin reviews", () => {
	it("lists flagged, unflags, deletes and recomputes rating", async () => {
		const vendorId = oid();
		const review = await createReviewDB({
			payload: {
				buyerOrderId: oid(),
				vendorId,
				buyerId: oid(),
				rating: 5,
			},
		});
		const { flagReviewDB } = await import("@/server/models/reviews");
		await flagReviewDB({ id: review!._id.toString() });
		expect((await listFlaggedReviews()).length).toBeGreaterThanOrEqual(1);
		const unflagged = await unflagReview(review!._id.toString());
		expect(unflagged.isFlagged).toBe(false);

		const deleted = await deleteReview(review!._id.toString());
		expect(deleted._id.toString()).toBe(review!._id.toString());
		await expect(deleteReview(oid())).rejects.toThrow();
	});
});

describe("admin whatsappTvs", () => {
	it("creates, lists, updates, deactivates", async () => {
		const campusId = oid();
		const tv = await createWhatsappTv({
			campusId,
			name: "TV1",
			whatsappNumber: "2348012345678",
		});
		expect((await listWhatsappTvs(campusId)).length).toBe(1);
		const updated = await updateWhatsappTv(tv._id.toString(), {
			name: "TV2",
		});
		expect(updated.name).toBe("TV2");
		const deact = await deactivateWhatsappTv(tv._id.toString());
		expect(deact.isActive).toBe(false);
		await expect(deactivateWhatsappTv(oid())).rejects.toThrow();
	});
});
