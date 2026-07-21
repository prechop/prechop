import {
	type APIRequestContext,
	expect,
	request,
	test,
} from "@playwright/test";
import { authenticatedRequest, VENDOR_EMAIL } from "./auth";

async function login(): Promise<APIRequestContext> {
	return authenticatedRequest(request, VENDOR_EMAIL);
}

test.describe("Vendor settings", () => {
	test("delivery defaults persist and drive /vendors/me", async () => {
		const vendor = await login();

		const save = await vendor.post("/api/vendors/me/delivery-defaults", {
			data: {
				defaultPickupAvailable: false,
				defaultDeliveryAvailable: true,
				defaultDeliveryFeeKobo: 25000,
			},
		});
		expect(save.ok(), "save delivery defaults").toBeTruthy();

		const me = await vendor.get("/api/vendors/me");
		expect(me.ok()).toBeTruthy();
		const profile = (await me.json()).data;
		expect(profile.defaultPickupAvailable).toBe(false);
		expect(profile.defaultDeliveryAvailable).toBe(true);
		expect(profile.defaultDeliveryFeeKobo).toBe(25000);

		await vendor.post("/api/vendors/me/delivery-defaults", {
			data: {
				defaultPickupAvailable: true,
				defaultDeliveryAvailable: false,
				defaultDeliveryFeeKobo: 0,
			},
		});
		await vendor.dispose();
	});

	test("notification preferences update only the keys sent", async () => {
		const vendor = await login();

		const save = await vendor.post("/api/vendors/me/notification-prefs", {
			data: { notifyNewOrders: false },
		});
		expect(save.ok(), "save notification prefs").toBeTruthy();

		const me = await vendor.get("/api/vendors/me");
		const profile = (await me.json()).data;
		expect(profile.notifyNewOrders).toBe(false);
		expect(profile.notifyPayouts).not.toBe(false);

		await vendor.post("/api/vendors/me/notification-prefs", {
			data: { notifyNewOrders: true },
		});
		await vendor.dispose();
	});

	test("empty notification-prefs payload is rejected", async () => {
		const vendor = await login();
		const res = await vendor.post("/api/vendors/me/notification-prefs", {
			data: {},
		});
		expect(res.status()).toBe(400);
		await vendor.dispose();
	});
});
