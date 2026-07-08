import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decrypt } from "@/server/constants/crypto";
import { MenuCategory, VendorStatus } from "@/server/models/enums";
import {
	createVendorProfileDB,
	getVendorProfileByEmailDB,
	getVendorProfileByIdDB,
	getVendorProfileByUserIdDB,
	getVendorWithSecretsDB,
	incrementVendorOrderCountDB,
	listVendorsDB,
	setVendorCompletenessDB,
	setVendorOpenForOrdersDB,
	setVendorStatusDB,
	updateVendorProfileDB,
	updateVendorRatingDB,
} from "@/server/models/vendorProfiles";
import { connectTestDB, dropAndDisconnect, oid } from "../helpers/db";

beforeAll(async () => {
	await connectTestDB();
});

afterAll(async () => {
	await dropAndDisconnect();
});

function email(): string {
	return `vendor-${Math.random().toString(36).slice(2)}@prechop.test`;
}

describe("vendorProfiles model", () => {
	it("creates with INCOMPLETE default status", async () => {
		const v = await createVendorProfileDB({
			payload: { userId: oid(), campusId: oid(), email: email() },
		});
		expect(v).not.toBeNull();
		expect(v!.status).toBe(VendorStatus.INCOMPLETE);
		expect(v!.categories).toEqual([]);
	});

	it("encrypts accountNumber on update and can decrypt via secrets read", async () => {
		const campusId = oid();
		const v = await createVendorProfileDB({
			payload: { userId: oid(), campusId, email: email() },
		});
		const id = v!._id.toString();
		const updated = await updateVendorProfileDB({
			id,
			payload: {
				accountNumber: "0123456789",
				bankCode: "058",
				accountName: "Ada Obi",
			},
		});
		expect(updated).not.toBeNull();
		// stored ciphertext, not plaintext
		expect(updated!.accountNumber).not.toBe("0123456789");

		const withSecrets = await getVendorWithSecretsDB({ id });
		expect(decrypt(withSecrets!.accountNumber!)).toBe("0123456789");

		// aggregate reads strip accountNumber entirely
		const publicRead = await getVendorProfileByIdDB({ id });
		expect(publicRead!.accountNumber).toBeUndefined();
	});

	it("changes status, open flag, completeness, counters, rating", async () => {
		const v = await createVendorProfileDB({
			payload: { userId: oid(), campusId: oid(), email: email() },
		});
		const id = v!._id.toString();
		expect(
			await setVendorStatusDB({ id, status: VendorStatus.ACTIVE }),
		).toBe(true);
		expect(
			await setVendorOpenForOrdersDB({ id, isOpenForOrders: true }),
		).toBe(true);
		expect(
			await setVendorCompletenessDB({ id, profileCompleteness: 100 }),
		).toBe(true);
		expect(await incrementVendorOrderCountDB({ id, by: 3 })).toBe(true);
		expect(
			await updateVendorRatingDB({ id, rating: 4.5, totalReviews: 2 }),
		).toBe(true);

		const read = await getVendorProfileByIdDB({ id });
		expect(read!.status).toBe(VendorStatus.ACTIVE);
		expect(read!.isOpenForOrders).toBe(true);
		expect(read!.profileCompleteness).toBe(100);
		expect(read!.totalOrders).toBe(3);
		expect(read!.rating).toBe(4.5);
	});

	it("looks up by email (lowercased) and userId", async () => {
		const e = email().toUpperCase();
		const userId = oid();
		const v = await createVendorProfileDB({
			payload: { userId, campusId: oid(), email: e },
		});
		const byEmail = await getVendorProfileByEmailDB({ email: e });
		expect(byEmail!._id.toString()).toBe(v!._id.toString());
		const byUser = await getVendorProfileByUserIdDB({ userId });
		expect(byUser!._id.toString()).toBe(v!._id.toString());
	});

	it("lists vendors with campus + status + category filters", async () => {
		const campusId = oid();
		const v = await createVendorProfileDB({
			payload: { userId: oid(), campusId, email: email() },
		});
		const id = v!._id.toString();
		await setVendorStatusDB({ id, status: VendorStatus.ACTIVE });
		await updateVendorProfileDB({
			id,
			payload: { categories: [MenuCategory.MEALS] },
		});
		await setVendorOpenForOrdersDB({ id, isOpenForOrders: true });

		const list = await listVendorsDB({
			campusId,
			status: VendorStatus.ACTIVE,
			category: MenuCategory.MEALS,
			openOnly: true,
		});
		expect(list.length).toBe(1);
		expect(list[0]._id.toString()).toBe(id);
	});
});
