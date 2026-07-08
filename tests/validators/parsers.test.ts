import { describe, expect, it } from "vitest";
import {
	parseListNotificationsQuery,
	listNotificationsQuerySchema,
} from "@/server/validators/notifications/validate";
import {
	parseSubscribePush,
	subscribePushSchema,
} from "@/server/validators/push/validate";
import { parseUpdateCampus } from "@/server/validators/users/validate";
import {
	createCampusSchema,
	createWhatsappTvSchema,
	ordersQuerySchema,
	updateSiteConfigsSchema,
	vendorsQuerySchema,
} from "@/server/validators/admin/validate";
import { OrderStatus, VendorStatus } from "@/server/models/enums";

describe("notifications validator", () => {
	it("coerces and transforms the query", () => {
		const parsed = parseListNotificationsQuery({
			unread: "true",
			limit: "10",
		});
		expect(parsed.unread).toBe(true);
		expect(parsed.limit).toBe(10);
	});

	it("throws on invalid input", () => {
		expect(() => parseListNotificationsQuery({ limit: "0" })).toThrow();
		expect(
			listNotificationsQuerySchema.safeParse({ unread: "maybe" }).success,
		).toBe(false);
	});
});

describe("push validator", () => {
	it("parses a valid subscription", () => {
		const parsed = parseSubscribePush({
			endpoint: "https://push.example/abc",
			keys: { p256dh: "a", auth: "b" },
		});
		expect(parsed.endpoint).toContain("https://");
	});

	it("rejects a non-URL endpoint or missing keys", () => {
		expect(() => parseSubscribePush({ endpoint: "not-url" })).toThrow();
		expect(
			subscribePushSchema.safeParse({
				endpoint: "https://x.y/z",
				keys: { p256dh: "a" },
			}).success,
		).toBe(false);
	});
});

describe("users updateCampus validator", () => {
	it("parses and rejects", () => {
		expect(parseUpdateCampus({ campusId: "abc" })).toEqual({
			campusId: "abc",
		});
		expect(() => parseUpdateCampus({ campusId: "" })).toThrow();
		expect(() => parseUpdateCampus({ extra: 1 })).toThrow();
	});
});

describe("admin validators", () => {
	it("createCampusSchema enforces required fields", () => {
		expect(
			createCampusSchema.safeParse({
				name: "Uni",
				shortCode: "UNI",
				state: "Lagos",
			}).success,
		).toBe(true);
		expect(createCampusSchema.safeParse({ name: "Uni" }).success).toBe(
			false,
		);
	});

	it("vendorsQuerySchema / ordersQuerySchema accept enums and coerce paging", () => {
		expect(
			vendorsQuerySchema.safeParse({ status: VendorStatus.ACTIVE }).success,
		).toBe(true);
		const parsed = ordersQuerySchema.safeParse({
			status: OrderStatus.PAID,
			limit: "20",
		});
		expect(parsed.success).toBe(true);
	});

	it("createWhatsappTvSchema requires campus + name + number", () => {
		expect(
			createWhatsappTvSchema.safeParse({
				campusId: "c1",
				name: "TV",
				whatsappNumber: "2348012345678",
			}).success,
		).toBe(true);
		expect(
			createWhatsappTvSchema.safeParse({ campusId: "c1" }).success,
		).toBe(false);
	});

	it("updateSiteConfigsSchema clamps profileCompletenessRequired to 0..100", () => {
		expect(
			updateSiteConfigsSchema.safeParse({
				profileCompletenessRequired: 50,
			}).success,
		).toBe(true);
		expect(
			updateSiteConfigsSchema.safeParse({
				profileCompletenessRequired: 101,
			}).success,
		).toBe(false);
	});
});
