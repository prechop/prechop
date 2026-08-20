import { describe, expect, it } from "vitest";
import {
	resolveListingStatus,
	resolveVendorStatus,
} from "@/components/VendorStatus";

const NOW = 1_700_000_000_000; // fixed "now" for deterministic tests

function cutoff(fromNowMs: number): string {
	return new Date(NOW + fromNowMs).toISOString();
}

describe("resolveListingStatus", () => {
	it("returns CLOSED_TODAY when vendor is closed", () => {
		const status = resolveListingStatus(
			{ status: "ACTIVE", cutoffTime: cutoff(HOUR) },
			{ vendorOpen: false, now: NOW },
		);
		expect(status.kind).toBe("CLOSED_TODAY");
		expect(status.compactLabel).toBe("Closed");
		expect(status.orderable).toBe(false);
		expect(status.closedReason).toBe("VENDOR_CLOSED");
	});

	it("returns CLOSED_TODAY for a non-ACTIVE listing", () => {
		const status = resolveListingStatus(
			{ status: "CLOSED", cutoffTime: cutoff(HOUR) },
			{ now: NOW },
		);
		expect(status.kind).toBe("CLOSED_TODAY");
		expect(status.closedReason).toBe("PAST_CUTOFF");
	});

	it("returns CLOSED_TODAY when cutoffTime is missing", () => {
		const status = resolveListingStatus(
			{ status: "ACTIVE", cutoffTime: "" as unknown as string },
			{ now: NOW },
		);
		expect(status.kind).toBe("CLOSED_TODAY");
		expect(status.closedReason).toBe("NO_LISTINGS");
	});

	it("returns CLOSED_TODAY when cutoff has passed", () => {
		const status = resolveListingStatus(
			{ status: "ACTIVE", cutoffTime: cutoff(-HOUR) },
			{ now: NOW },
		);
		expect(status.kind).toBe("CLOSED_TODAY");
		expect(status.compactLabel).toBe("Closed");
		expect(status.orderable).toBe(false);
		expect(status.closedReason).toBe("PAST_CUTOFF");
		expect(status.minutesToCutoff).toBe(0);
	});

	it("returns OPENS_AT when availableFrom is in the future", () => {
		const status = resolveListingStatus(
			{
				status: "ACTIVE",
				availableFrom: cutoff(HOUR),
				cutoffTime: cutoff(3 * HOUR),
			},
			{ now: NOW },
		);
		expect(status.kind).toBe("OPENS_AT");
		expect(status.orderable).toBe(false);
		expect(status.compactLabel).toContain("Opens");
	});

	it("returns CLOSING_SOON when less than 30 minutes remain", () => {
		const status = resolveListingStatus(
			{ status: "ACTIVE", cutoffTime: cutoff(10 * MINUTE) },
			{ now: NOW },
		);
		expect(status.kind).toBe("CLOSING_SOON");
		expect(status.compactLabel).toBe("Closing soon · 10m");
		expect(status.label).toBe("Closing soon · 10m");
		expect(status.orderable).toBe(true);
		expect(status.minutesToCutoff).toBe(10);
	});

	it("returns OPEN with a days countdown when more than 24 hours remain", () => {
		const status = resolveListingStatus(
			{ status: "ACTIVE", cutoffTime: cutoff(3 * DAY) },
			{ now: NOW },
		);
		expect(status.kind).toBe("OPEN");
		expect(status.compactLabel).toBe("Closes in 3 days");
		expect(status.label).toBe("Closes in 3 days");
		expect(status.orderable).toBe(true);
		expect(status.minutesToCutoff).toBe(3 * 24 * 60);
	});

	it("returns OPEN with hours and minutes when less than 24 hours remain", () => {
		const status = resolveListingStatus(
			{ status: "ACTIVE", cutoffTime: cutoff(12 * HOUR + 30 * MINUTE) },
			{ now: NOW },
		);
		expect(status.kind).toBe("OPEN");
		expect(status.compactLabel).toBe("Closes in 12h 30m");
		expect(status.label).toBe("Closes in 12h 30m");
		expect(status.orderable).toBe(true);
		expect(status.minutesToCutoff).toBe(12 * 60 + 30);
	});

	it("returns OPEN with minutes only when less than one hour remains", () => {
		const status = resolveListingStatus(
			{ status: "ACTIVE", cutoffTime: cutoff(45 * MINUTE) },
			{ now: NOW },
		);
		expect(status.kind).toBe("OPEN");
		expect(status.compactLabel).toBe("Closes in 45m");
		expect(status.label).toBe("Closes in 45m");
		expect(status.orderable).toBe(true);
		expect(status.minutesToCutoff).toBe(45);
	});

	it("returns OPEN with exact hours when remainder is zero", () => {
		const status = resolveListingStatus(
			{ status: "ACTIVE", cutoffTime: cutoff(2 * HOUR) },
			{ now: NOW },
		);
		expect(status.kind).toBe("OPEN");
		expect(status.compactLabel).toBe("Closes in 2h");
		expect(status.label).toBe("Closes in 2h");
	});

	it("returns singular day wording for exactly 1 day", () => {
		const status = resolveListingStatus(
			{ status: "ACTIVE", cutoffTime: cutoff(DAY) },
			{ now: NOW },
		);
		expect(status.kind).toBe("OPEN");
		expect(status.compactLabel).toBe("Closes in 1 day");
		expect(status.label).toBe("Closes in 1 day");
	});

	it("never shows negative time", () => {
		const status = resolveListingStatus(
			{ status: "ACTIVE", cutoffTime: cutoff(-DAY) },
			{ now: NOW },
		);
		expect(status.kind).toBe("CLOSED_TODAY");
		expect(status.minutesToCutoff).toBe(0);
	});

	it("transitions from OPEN to CLOSING_SOON to CLOSED_TODAY as time passes", () => {
		const closingIn = 2 * HOUR + 20 * MINUTE;
		const atOpen = resolveListingStatus(
			{ status: "ACTIVE", cutoffTime: cutoff(closingIn) },
			{ now: NOW },
		);
		expect(atOpen.kind).toBe("OPEN");
		expect(atOpen.compactLabel).toBe("Closes in 2h 20m");

		const atClosing = resolveListingStatus(
			{ status: "ACTIVE", cutoffTime: cutoff(closingIn) },
			{ now: NOW + 2 * HOUR },
		);
		expect(atClosing.kind).toBe("CLOSING_SOON");
		expect(atClosing.compactLabel).toBe("Closing soon · 20m");

		const atClosed = resolveListingStatus(
			{ status: "ACTIVE", cutoffTime: cutoff(closingIn) },
			{ now: NOW + closingIn + 1_000 },
		);
		expect(atClosed.kind).toBe("CLOSED_TODAY");
		expect(atClosed.compactLabel).toBe("Closed");
	});
});

describe("resolveVendorStatus", () => {
	it("uses the best listing status when vendor is open", () => {
		const status = resolveVendorStatus(
			{
				isOpenForOrders: true,
				listings: [
					{ status: "ACTIVE", cutoffTime: cutoff(10 * MINUTE) },
					{ status: "ACTIVE", cutoffTime: cutoff(20 * MINUTE) },
				],
			},
			{ now: NOW },
		);
		expect(status.kind).toBe("CLOSING_SOON");
		expect(status.compactLabel).toBe("Closing soon · 10m");
	});

	it("returns closed when vendor is not open for orders", () => {
		const status = resolveVendorStatus(
			{ isOpenForOrders: false, listings: [] },
			{ now: NOW },
		);
		expect(status.kind).toBe("CLOSED_TODAY");
		expect(status.closedReason).toBe("VENDOR_CLOSED");
	});
});

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
