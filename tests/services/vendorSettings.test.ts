import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getVendorProfileByIdDB } from "@/server/models/vendorProfiles";
import { paystackProvider } from "@/server/providers/paystack";
import { updateDeliveryDefaults } from "@/server/services/vendors/deliveryDefaults";
import { updateNotificationPrefs } from "@/server/services/vendors/notificationPrefs";
import { resolveBankAccount } from "@/server/services/vendors/resolveBank";
import { connectTestDB, dropAndDisconnect } from "../helpers/db";
import { makeVendor } from "../helpers/factories";

beforeAll(async () => {
	await connectTestDB();
	vi.spyOn(paystackProvider, "resolveAccountNumber").mockResolvedValue({
		account_number: "0123456789",
		account_name: "Ada Obi",
	});
	vi.spyOn(paystackProvider, "getBanks").mockResolvedValue([
		{ name: "GTBank", code: "058", active: true },
	]);
	vi.spyOn(paystackProvider, "createSubaccount").mockResolvedValue({
		subaccount_code: "ACCT_gen",
		account_number: "0123456789",
		account_name: "Ada Obi",
	});
});

afterAll(async () => {
	vi.restoreAllMocks();
	await dropAndDisconnect();
});

describe("resolveBankAccount", () => {
	it("returns the resolved account name and bank name without persisting", async () => {
		const result = await resolveBankAccount({
			bankCode: "058",
			accountNumber: "0123456789",
		});
		expect(result.accountName).toBe("Ada Obi");
		expect(result.bankName).toBe("GTBank");
		expect(result.bankCode).toBe("058");
		// It must NOT create a subaccount (that only happens on commit).
		expect(paystackProvider.createSubaccount).not.toHaveBeenCalled();
	});
});

describe("new vendor profile defaults", () => {
	it("opts vendors into notifications and pickup-by-default", async () => {
		const { vendorId } = await makeVendor();
		const vendor = await getVendorProfileByIdDB({ id: vendorId });
		expect(vendor?.notifyNewOrders).toBe(true);
		expect(vendor?.notifyPayouts).toBe(true);
		expect(vendor?.notifyReviews).toBe(true);
		expect(vendor?.defaultPickupAvailable).toBe(true);
		expect(vendor?.defaultDeliveryAvailable).toBe(false);
		expect(vendor?.defaultDeliveryFeeKobo).toBe(0);
	});
});

describe("updateNotificationPrefs", () => {
	it("updates only the keys provided, leaving the rest untouched", async () => {
		const { userId, vendorId } = await makeVendor();
		const updated = await updateNotificationPrefs({
			userId,
			prefs: { notifyNewOrders: false },
		});
		expect(updated?.notifyNewOrders).toBe(false);
		// Untouched keys keep their (default true) value.
		expect(updated?.notifyPayouts).toBe(true);
		expect(updated?.notifyReviews).toBe(true);

		const persisted = await getVendorProfileByIdDB({ id: vendorId });
		expect(persisted?.notifyNewOrders).toBe(false);
		expect(persisted?.notifyPayouts).toBe(true);
	});
});

describe("updateDeliveryDefaults", () => {
	it("persists pickup/delivery/fee defaults", async () => {
		const { userId, vendorId } = await makeVendor();
		const updated = await updateDeliveryDefaults({
			userId,
			defaults: {
				defaultPickupAvailable: false,
				defaultDeliveryAvailable: true,
				defaultDeliveryFeeKobo: 30000,
			},
		});
		expect(updated?.defaultPickupAvailable).toBe(false);
		expect(updated?.defaultDeliveryAvailable).toBe(true);
		expect(updated?.defaultDeliveryFeeKobo).toBe(30000);

		const persisted = await getVendorProfileByIdDB({ id: vendorId });
		expect(persisted?.defaultDeliveryAvailable).toBe(true);
		expect(persisted?.defaultDeliveryFeeKobo).toBe(30000);
	});
});
