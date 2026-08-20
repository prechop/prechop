import { describe, expect, it } from "vitest";
import {
	listingWhatsAppMessage,
	storeUrl,
	storeWhatsAppMessage,
} from "@/constants/shareLinks";
import { storeSlugBase } from "@/server/services/vendors/storeSlug";

describe("vendor store experience", () => {
	it("creates readable slugs and protects application routes", () => {
		expect(storeSlugBase("Aramide’s Kitchen")).toBe("aramides-kitchen");
		expect(storeSlugBase("Vendor")).toBe("vendor-store");
		expect(storeSlugBase("  Àmáka Foods  ")).toBe("amaka-foods");
	});

	it("builds the permanent store share message from one URL helper", () => {
		const url = storeUrl("aramides-kitchen");
		const message = storeWhatsAppMessage(
			"Aramide’s Kitchen",
			"aramides-kitchen",
		);
		expect(message).toContain("Aramide’s Kitchen");
		expect(message).toContain(url);
		expect(message).toContain("See what’s available and order here:");
	});

	it("omits a portions line for unlimited menus", () => {
		const message = listingWhatsAppMessage({
			businessName: "Aramide’s Kitchen",
			title: "Jollof & Chicken",
			priceLabel: "₦1,500",
			cutoffTime: "2026-08-10T14:00:00.000Z",
			shareableToken: "listing-token",
		});
		expect(message).toContain("Jollof & Chicken — ₦1,500");
		expect(message).not.toContain("portions left");
		expect(message).toContain("/o/listing-token");
	});
});
