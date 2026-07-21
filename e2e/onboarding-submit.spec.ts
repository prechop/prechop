import {
	type APIRequestContext,
	expect,
	request,
	test,
} from "@playwright/test";
import mongoose from "mongoose";
import { connectMongoDB } from "../src/server/databases/mongoDB";
import { createUserDB, createVendorProfileDB } from "../src/server/models";
import { getBuiltInGroupId, seedBuiltInIam } from "../src/server/services/iam";
import { ADMIN_EMAIL, authenticatedRequest } from "./auth";
import { BASE_URL, ORIGIN } from "./urls";

const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27018";
const DB_NAME = process.env.DB_NAME ?? "prechop";

const APPLICANT_EMAIL = "throwaway-onboarding@prechop.test";

let mongo: mongoose.mongo.MongoClient;
let applicantVendorId: mongoose.mongo.ObjectId;
let campusId = "";

async function purgeApplicant() {
	const db = mongo.db(DB_NAME);
	const profile = await db
		.collection("vendorprofiles")
		.findOne({ email: APPLICANT_EMAIL });
	if (profile) {
		await db.collection("users").deleteOne({ _id: profile.userId });
		await db.collection("vendorprofiles").deleteOne({ _id: profile._id });
	}
}

test.beforeAll(async () => {
	mongo = new mongoose.mongo.MongoClient(MONGODB_URI);
	await mongo.connect();
	await connectMongoDB();
	await seedBuiltInIam();
	await purgeApplicant();

	const anon = await request.newContext({
		baseURL: BASE_URL,
		extraHTTPHeaders: { origin: ORIGIN },
	});
	const campuses = (await (await anon.get("/api/campuses")).json())
		.data as Array<{ id: string }>;
	await anon.dispose();
	expect(campuses.length, "seed must create a campus").toBeGreaterThan(0);
	campusId = campuses[0].id;

	const vendorGroupId = await getBuiltInGroupId("Vendors");
	const user = await createUserDB({
		payload: {
			email: APPLICANT_EMAIL,
			firstName: "Applicant",
			lastName: "Vendor",
			campusId,
			groupIds: vendorGroupId ? [vendorGroupId] : [],
		},
	});
	if (!user) throw new Error("applicant user was not created");

	const profile = await createVendorProfileDB({
		payload: {
			userId: user._id.toString(),
			campusId,
			email: APPLICANT_EMAIL,
		},
	});
	if (!profile) throw new Error("vendor profile was not created");
	expect(profile.status).toBe("INCOMPLETE");
	applicantVendorId = new mongoose.mongo.ObjectId(profile._id.toString());
});

test.afterAll(async () => {
	if (mongo) await purgeApplicant();
	await mongo?.close();
});

async function applicantLogin(): Promise<APIRequestContext> {
	return authenticatedRequest(request, APPLICANT_EMAIL);
}

async function adminLogin(): Promise<APIRequestContext> {
	return authenticatedRequest(request, ADMIN_EMAIL);
}

test.describe("Vendor onboarding submit and approval", () => {
	test("submit is blocked while onboarding steps are outstanding", async () => {
		const vendor = await applicantLogin();

		const me = (await (await vendor.get("/api/vendors/me")).json())
			.data as {
			status: string;
		};
		expect(me.status).toBe("INCOMPLETE");

		const early = await vendor.post("/api/vendors/me/submit", { data: {} });
		expect(early.status(), "submit must be blocked while incomplete").toBe(
			409,
		);
		await vendor.dispose();
	});

	test("completing every step unlocks submit even below 100% completeness", async () => {
		const vendor = await applicantLogin();

		expect(
			(
				await vendor.post("/api/vendors/me/business-identity", {
					data: {
						businessName: "Throwaway Kitchen",
						vendorType: "STUDENT_COOK",
						email: APPLICANT_EMAIL,
					},
				})
			).ok(),
			"identity",
		).toBeTruthy();

		expect(
			(
				await vendor.post("/api/vendors/me/categories", {
					data: { categories: ["MEALS"] },
				})
			).ok(),
			"categories",
		).toBeTruthy();

		expect(
			(
				await vendor.post("/api/vendors/me/location", {
					data: {
						locationType: "ON_CAMPUS",
						campusId,
						hostelOrStallName: "Block C, Room 12",
					},
				})
			).ok(),
			"location",
		).toBeTruthy();

		await mongo
			.db(DB_NAME)
			.collection("vendorprofiles")
			.updateOne(
				{ _id: applicantVendorId },
				{
					$set: {
						bankCode: "058",
						bankName: "GTBank",
						paystackSubaccountCode: "ACCT_e2e_throwaway",
					},
				},
			);

		expect(
			(
				await vendor.post("/api/vendors/me/profile-image/confirm", {
					data: { imageUrl: "https://cdn.test/throwaway.png" },
				})
			).ok(),
			"image",
		).toBeTruthy();

		const me = (await (await vendor.get("/api/vendors/me")).json())
			.data as {
			profileCompleteness: number;
			businessName: string;
			locationType: string;
		};
		expect(me.businessName).toBe("Throwaway Kitchen");
		expect(me.locationType).toBe("ON_CAMPUS");
		expect(me.profileCompleteness).toBeLessThan(100);

		const submit = await vendor.post("/api/vendors/me/submit", {
			data: {},
		});
		expect(submit.status(), "submit must succeed once steps are done").toBe(
			200,
		);
		const submitBody = (await submit.json()).data as { status: string };
		expect(submitBody.status).toBe("PENDING_REVIEW");

		const doc = await mongo
			.db(DB_NAME)
			.collection("vendorprofiles")
			.findOne({ _id: applicantVendorId });
		expect(doc?.status).toBe("PENDING_REVIEW");
		expect(doc?.submittedAt).toBeTruthy();
		await vendor.dispose();
	});

	test("admin sees the applicant in the queue and approval activates it", async () => {
		const admin = await adminLogin();

		const queue = (await (await admin.get("/api/admin/onboarding")).json())
			.data as Array<{ id: string; businessName: string }>;
		const target = queue.find(
			(v) => v.businessName === "Throwaway Kitchen",
		);
		if (!target) throw new Error("applicant must be in the review queue");

		const approve = await admin.post(
			`/api/admin/onboarding/${target.id}/approve`,
			{ data: {} },
		);
		expect(approve.status()).toBe(200);

		const after = (await (await admin.get("/api/admin/onboarding")).json())
			.data as Array<{ businessName: string }>;
		expect(
			after.find((v) => v.businessName === "Throwaway Kitchen"),
		).toBeFalsy();

		const doc = await mongo
			.db(DB_NAME)
			.collection("vendorprofiles")
			.findOne({ _id: applicantVendorId });
		expect(doc?.status).toBe("ACTIVE");
		await admin.dispose();
	});
});
