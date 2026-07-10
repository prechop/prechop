import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
	DayOfWeek,
	getVendorProfileByIdDB,
	LocationType,
	MenuCategory,
	updateVendorProfileDB,
	upsertTimetableEntryDB,
	VendorStatus,
} from "@/server/models";
import {
	approveVendor,
	getOnboardingSubmission,
	listOnboardingQueue,
	rejectVendor,
} from "@/server/services/admin/onboarding";
import { seedBuiltInIam } from "@/server/services/iam";
import { submitVendorForReview } from "@/server/services/vendors/submitForReview";
import {
	clearCollections,
	connectTestDB,
	dropAndDisconnect,
	oid,
} from "../helpers/db";
import { makeMenuItem, makeVendor } from "../helpers/factories";

const actor = { userId: oid(), role: "Administrators" };

beforeAll(async () => {
	await connectTestDB();
});

afterAll(async () => {
	await dropAndDisconnect();
});

beforeEach(async () => {
	await clearCollections();
	await seedBuiltInIam();
});

/**
 * Build a vendor that has completed every onboarding step (business identity,
 * categories, location, bank, profile image) — the checklist the submit gate
 * actually requires. Optionally also add menu items + timetable entries so the
 * marketplace completeness score reaches 100.
 */
async function makeOnboardedVendor({
	withMenuAndTimetable = false,
}: {
	withMenuAndTimetable?: boolean;
} = {}) {
	const { userId, vendorId, campusId } = await makeVendor({
		status: VendorStatus.INCOMPLETE,
	});
	await updateVendorProfileDB({
		id: vendorId,
		payload: {
			profileImageUrl: "https://cdn.test/v.png",
			categories: [MenuCategory.MEALS],
			locationType: LocationType.ON_CAMPUS,
			hostelOrStallName: "Block C",
			paystackSubaccountCode: "ACCT_test",
		},
	});
	if (withMenuAndTimetable) {
		for (let i = 0; i < 3; i++) {
			const item = await makeMenuItem({
				vendorId,
				campusId,
				name: `Item ${i}`,
			});
			await upsertTimetableEntryDB({
				vendorId,
				menuItemId: item!._id.toString(),
				dayOfWeek: DayOfWeek.MONDAY,
			});
		}
	}
	return { userId, vendorId, campusId };
}

/** A fully onboarded vendor whose completeness also reaches 100. */
function makeSubmittableVendor() {
	return makeOnboardedVendor({ withMenuAndTimetable: true });
}

describe("vendor onboarding gate", () => {
	it("blocks submission when the profile is incomplete", async () => {
		const { userId, vendorId } = await makeVendor({
			status: VendorStatus.INCOMPLETE,
		});
		await expect(
			submitVendorForReview({ vendorId, userId }),
		).rejects.toThrow();
		const after = await getVendorProfileByIdDB({ id: vendorId });
		expect(after!.status).toBe(VendorStatus.INCOMPLETE);
	});

	it("moves a complete profile to PENDING_REVIEW on submit", async () => {
		const { userId, vendorId } = await makeSubmittableVendor();
		const res = await submitVendorForReview({ vendorId, userId });
		expect(res.status).toBe(VendorStatus.PENDING_REVIEW);
		expect(res.profileCompleteness).toBe(100);
		const after = await getVendorProfileByIdDB({ id: vendorId });
		expect(after!.status).toBe(VendorStatus.PENDING_REVIEW);
		expect(after!.submittedAt).toBeTruthy();
	});

	it("allows submission once the onboarding steps are done, even below 100% completeness", async () => {
		// Regression: menu items + timetable entries live behind the
		// active-vendor gate, so an applicant maxes out at ~60% completeness.
		// Submission must NOT require them — only the onboarding checklist.
		const { userId, vendorId } = await makeOnboardedVendor();
		const res = await submitVendorForReview({ vendorId, userId });
		expect(res.status).toBe(VendorStatus.PENDING_REVIEW);
		expect(res.profileCompleteness).toBeLessThan(100);
		const after = await getVendorProfileByIdDB({ id: vendorId });
		expect(after!.status).toBe(VendorStatus.PENDING_REVIEW);
	});

	it("blocks submission when a single onboarding step (location) is missing", async () => {
		const { userId, vendorId } = await makeVendor({
			status: VendorStatus.INCOMPLETE,
		});
		// Everything except location.
		await updateVendorProfileDB({
			id: vendorId,
			payload: {
				profileImageUrl: "https://cdn.test/v.png",
				categories: [MenuCategory.MEALS],
				paystackSubaccountCode: "ACCT_test",
			},
		});
		await expect(
			submitVendorForReview({ vendorId, userId }),
		).rejects.toThrow();
		const after = await getVendorProfileByIdDB({ id: vendorId });
		expect(after!.status).toBe(VendorStatus.INCOMPLETE);
	});

	it("rejects a second submission while pending", async () => {
		const { userId, vendorId } = await makeSubmittableVendor();
		await submitVendorForReview({ vendorId, userId });
		await expect(
			submitVendorForReview({ vendorId, userId }),
		).rejects.toThrow();
	});

	it("admin approval activates the vendor", async () => {
		const { userId, vendorId } = await makeSubmittableVendor();
		await submitVendorForReview({ vendorId, userId });
		const approved = await approveVendor({ id: vendorId, actor });
		expect(approved.status).toBe(VendorStatus.ACTIVE);
		const after = await getVendorProfileByIdDB({ id: vendorId });
		expect(after!.status).toBe(VendorStatus.ACTIVE);
		expect(after!.reviewedBy?.toString()).toBe(actor.userId);
	});

	it("admin rejection requests changes and allows resubmit", async () => {
		const { userId, vendorId } = await makeSubmittableVendor();
		await submitVendorForReview({ vendorId, userId });
		const rejected = await rejectVendor({
			id: vendorId,
			reason: "Business name unclear",
			actor,
		});
		expect(rejected.status).toBe(VendorStatus.CHANGES_REQUESTED);
		const after = await getVendorProfileByIdDB({ id: vendorId });
		expect(after!.rejectionReason).toBe("Business name unclear");

		// The vendor can resubmit from CHANGES_REQUESTED.
		const res = await submitVendorForReview({ vendorId, userId });
		expect(res.status).toBe(VendorStatus.PENDING_REVIEW);
	});

	it("cannot approve a vendor that is not under review", async () => {
		const { vendorId } = await makeVendor({ status: VendorStatus.ACTIVE });
		await expect(approveVendor({ id: vendorId, actor })).rejects.toThrow();
	});

	it("lists the review queue and returns a full submission with owner", async () => {
		const { userId, vendorId } = await makeSubmittableVendor();
		await submitVendorForReview({ vendorId, userId });

		const queue = await listOnboardingQueue({});
		expect(queue.map((v) => (v.id ?? v._id).toString())).toContain(
			vendorId,
		);

		const submission = await getOnboardingSubmission(vendorId);
		expect(submission.vendor.status).toBe(VendorStatus.PENDING_REVIEW);
		expect(submission.owner?.id).toBe(userId);
	});

	it("rejecting a non-pending vendor throws", async () => {
		const { vendorId } = await makeVendor({ status: VendorStatus.ACTIVE });
		await expect(
			rejectVendor({ id: vendorId, reason: "nope", actor }),
		).rejects.toThrow();
	});
});
