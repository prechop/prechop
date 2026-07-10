import {
	type APIRequestContext,
	expect,
	request,
	test,
} from "@playwright/test";
import { hash as bcryptHash } from "bcrypt";
import IoRedis from "ioredis";
import mongoose from "mongoose";

// End-to-end coverage for the vendor onboarding → submit-for-review → admin
// approval flow, driven against the real server + seeded local Mongo/Redis
// (run `pnpm seed` first). This is the regression guard for the submit-gate
// fix: the final "Submit for review" onboarding step must unlock as soon as
// the five detail steps (identity, categories, location, bank, image) are
// done — WITHOUT requiring the marketplace completeness score to hit 100%.
// That score also rewards menu items + timetable entries, which live behind
// the active-vendor gate and cannot be added before approval; requiring them
// would deadlock every applicant at ~60%.
//
// Auth reuses the OTP-planting technique (see admin-iam.spec.ts): the code is
// only stored hashed, so we overwrite it with a known value between the
// request and verify steps — a test-only technique that touches no production
// code. The server accepts either the auth cookie or `Authorization: Bearer`;
// the cookie is `secure` under `next start`, so we carry the Bearer token.

const REDIS_URI = process.env.REDIS_URI ?? "redis://127.0.0.1:6379";
const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27018";
const DB_NAME = process.env.DB_NAME ?? "prechop";
const BASE_URL = "http://127.0.0.1:3100";
const ORIGIN = "http://localhost:3100";

const ADMIN_PHONE = process.env.SEED_ADMIN_PHONE ?? "08130135756";
// A throwaway applicant created/torn down by this spec — never a seeded user.
const APPLICANT_PHONE = "08155500042";
const APPLICANT_EMAIL = "throwaway-onboarding@prechop.test";
const KNOWN_OTP = "123456";

let redis: IoRedis;
let mongo: mongoose.mongo.MongoClient;
let applicantVendorId: mongoose.mongo.ObjectId;

/** Remove any applicant left over from a previous run (phones are encrypted at
 * rest, so we find the user via the vendor profile's plaintext email). */
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
	redis = new IoRedis(REDIS_URI, { maxRetriesPerRequest: 3 });
	mongo = new mongoose.mongo.MongoClient(MONGODB_URI);
	await mongo.connect();
	await purgeApplicant();

	const anon = await request.newContext({
		baseURL: BASE_URL,
		extraHTTPHeaders: { origin: ORIGIN },
	});
	const campuses = (await (await anon.get("/api/campuses")).json())
		.data as Array<{ id: string }>;
	expect(campuses.length, "seed must create a campus").toBeGreaterThan(0);

	// Create the applicant through the real vendor-application path (encrypts
	// the phone, joins the Vendors group, opens an INCOMPLETE profile). We omit
	// businessName so the identity step is genuinely still outstanding.
	await redis.del(`otp:ratelimit:${APPLICANT_PHONE}`);
	const reg = await anon.post("/api/auth/register/vendor", {
		data: {
			firstName: "Applicant",
			lastName: "Vendor",
			phone: APPLICANT_PHONE,
			campusId: campuses[0].id,
			email: APPLICANT_EMAIL,
		},
	});
	expect(reg.ok(), "vendor registration").toBeTruthy();
	await anon.dispose();

	const profile = await mongo
		.db(DB_NAME)
		.collection("vendorprofiles")
		.findOne({ email: APPLICANT_EMAIL });
	expect(profile, "vendor profile created by registration").toBeTruthy();
	expect(profile?.status).toBe("INCOMPLETE");
	applicantVendorId = profile!._id;
});

test.afterAll(async () => {
	if (mongo) await purgeApplicant();
	await redis?.del(`otp:code:${APPLICANT_PHONE}`);
	await redis?.del(`otp:ratelimit:${APPLICANT_PHONE}`);
	await redis?.quit();
	await mongo?.close();
});

async function login(phone: string): Promise<APIRequestContext> {
	const anon = await request.newContext({
		baseURL: BASE_URL,
		extraHTTPHeaders: { origin: ORIGIN },
	});
	await redis.del(`otp:ratelimit:${phone}`);
	const req = await anon.post("/api/auth/otp/request", { data: { phone } });
	expect(req.ok(), "otp request").toBeTruthy();
	await redis.setex(
		`otp:code:${phone}`,
		600,
		await bcryptHash(KNOWN_OTP, 10),
	);
	const verify = await anon.post("/api/auth/otp/verify", {
		data: { phone, otp: KNOWN_OTP },
	});
	expect(verify.ok(), "otp verify").toBeTruthy();
	const accessToken = (await verify.json()).data.accessToken as string;
	expect(accessToken, "access token").toBeTruthy();
	await anon.dispose();

	return request.newContext({
		baseURL: BASE_URL,
		extraHTTPHeaders: {
			origin: ORIGIN,
			authorization: `Bearer ${accessToken}`,
		},
	});
}

test.describe("Vendor onboarding → submit → approval", () => {
	test("submit is blocked while onboarding steps are outstanding", async () => {
		const vendor = await login(APPLICANT_PHONE);

		const me = (await (await vendor.get("/api/vendors/me")).json())
			.data as {
			status: string;
		};
		expect(me.status).toBe("INCOMPLETE");

		// The final todo is disabled: submitting before the steps are done is
		// rejected server-side (the client mirrors this by disabling the button).
		const early = await vendor.post("/api/vendors/me/submit", { data: {} });
		expect(early.status(), "submit must be blocked while incomplete").toBe(
			409,
		);
		await vendor.dispose();
	});

	test("completing every step unlocks submit even below 100% completeness", async () => {
		const vendor = await login(APPLICANT_PHONE);

		// Step 1 — business identity.
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

		// Step 2 — categories.
		expect(
			(
				await vendor.post("/api/vendors/me/categories", {
					data: { categories: ["MEALS"] },
				})
			).ok(),
			"categories",
		).toBeTruthy();

		// Step 3 — location.
		expect(
			(
				await vendor.post("/api/vendors/me/location", {
					data: {
						locationType: "ON_CAMPUS",
						hostelOrStallName: "Block C, Room 12",
					},
				})
			).ok(),
			"location",
		).toBeTruthy();

		// Step 4 — bank. The real endpoint calls Paystack (resolve + create
		// subaccount), an external service not available to the hermetic e2e
		// stack, so we persist the completed-bank signal directly. The gate
		// only reads `paystackSubaccountCode`, which is exactly what a real
		// bank save writes.
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

		// Step 5 — profile image (confirm accepts any URL; upload itself is S3).
		expect(
			(
				await vendor.post("/api/vendors/me/profile-image/confirm", {
					data: { imageUrl: "https://cdn.test/throwaway.png" },
				})
			).ok(),
			"image",
		).toBeTruthy();

		// All five detail steps are done, but the vendor has NO menu items and
		// NO timetable entries — so completeness is well below 100%.
		const me = (await (await vendor.get("/api/vendors/me")).json())
			.data as {
			profileCompleteness: number;
			businessName: string;
			locationType: string;
		};
		expect(me.businessName).toBe("Throwaway Kitchen");
		expect(me.locationType).toBe("ON_CAMPUS");
		expect(
			me.profileCompleteness,
			"completeness stays <100 without menu/timetable — proves the gate is decoupled",
		).toBeLessThan(100);

		// The final todo is now enabled: submission succeeds.
		const submit = await vendor.post("/api/vendors/me/submit", {
			data: {},
		});
		expect(submit.status(), "submit must succeed once steps are done").toBe(
			200,
		);
		const submitBody = (await submit.json()).data as { status: string };
		expect(submitBody.status).toBe("PENDING_REVIEW");

		// Persisted: the DB reflects the pending submission.
		const doc = await mongo
			.db(DB_NAME)
			.collection("vendorprofiles")
			.findOne({ _id: applicantVendorId });
		expect(doc?.status).toBe("PENDING_REVIEW");
		expect(doc?.submittedAt).toBeTruthy();
		await vendor.dispose();
	});

	test("admin sees the applicant in the queue and approval activates it", async () => {
		const admin = await login(ADMIN_PHONE);

		const queue = (await (await admin.get("/api/admin/onboarding")).json())
			.data as Array<{ id: string; businessName: string }>;
		const target = queue.find(
			(v) => v.businessName === "Throwaway Kitchen",
		);
		expect(target, "applicant must be in the review queue").toBeTruthy();

		const approve = await admin.post(
			`/api/admin/onboarding/${target!.id}/approve`,
			{ data: {} },
		);
		expect(approve.status()).toBe(200);

		// Persisted: it leaves the queue and is now ACTIVE.
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
