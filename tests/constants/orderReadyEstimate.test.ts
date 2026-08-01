import { describe, expect, it } from "vitest";
import {
	formatReadyEstimateTime,
	readyEstimateNoteForTimelineStep,
} from "@/constants/orderReadyEstimate";

describe("order ready estimate display", () => {
	const sameDayReference = new Date("2026-07-30T20:00:00.000Z");

	it("shows the original accepted estimate on the active Accepted step", () => {
		const note = readyEstimateNoteForTimelineStep(
			{
				status: "ACCEPTED",
				fulfillmentType: "PICKUP",
				expectedReadyAt: "2026-07-30T22:45:00.000Z",
			},
			"ACCEPTED",
			sameDayReference,
		);
		expect(note?.lines).toEqual(["Estimated ready by 11:45 PM"]);
	});

	it("uses the revised estimate as the latest active Cooking estimate", () => {
		const note = readyEstimateNoteForTimelineStep(
			{
				status: "COOKING",
				fulfillmentType: "DELIVERY",
				expectedReadyAt: "2026-07-30T22:21:00.000Z",
				revisedReadyAt: "2026-07-30T22:45:00.000Z",
			},
			"COOKING",
			sameDayReference,
		);
		expect(note?.lines).toEqual(["Estimated ready by 11:45 PM"]);
	});

	it("shows preparing estimates inside the Cooking timeline stage", () => {
		const note = readyEstimateNoteForTimelineStep(
			{
				status: "PREPARING",
				fulfillmentType: "PICKUP",
				expectedReadyAt: "2026-07-30T22:45:00.000Z",
			},
			"COOKING",
			sameDayReference,
		);
		expect(note?.lines).toEqual(["Estimated ready by 11:45 PM"]);
	});

	it("shows original and updated estimates for running-late orders", () => {
		const note = readyEstimateNoteForTimelineStep(
			{
				status: "COOKING",
				fulfillmentType: "DELIVERY",
				expectedReadyAt: "2026-07-30T22:21:00.000Z",
				revisedReadyAt: "2026-07-30T22:45:00.000Z",
				lateMarkedAt: "2026-07-30T22:22:00.000Z",
			},
			"COOKING",
			sameDayReference,
		);
		expect(note?.lines).toEqual([
			"Original estimate: 11:21 PM",
			"Updated estimate: 11:45 PM",
		]);
	});

	it("shows ready time on the delivery ready step", () => {
		const note = readyEstimateNoteForTimelineStep(
			{
				status: "READY_FOR_DELIVERY",
				fulfillmentType: "DELIVERY",
				expectedReadyAt: "2026-07-30T22:45:00.000Z",
				readyAt: "2026-07-30T22:43:00.000Z",
			},
			"READY_FOR_DELIVERY",
			sameDayReference,
		);
		expect(note?.lines).toEqual(["Ready at 11:43 PM"]);
	});

	it("shows ready time on the pickup ready step", () => {
		const note = readyEstimateNoteForTimelineStep(
			{
				status: "READY_FOR_PICKUP",
				fulfillmentType: "PICKUP",
				expectedReadyAt: "2026-07-30T22:45:00.000Z",
				readyAt: "2026-07-30T22:43:00.000Z",
			},
			"READY_FOR_PICKUP",
			sameDayReference,
		);
		expect(note?.lines).toEqual(["Ready at 11:43 PM"]);
	});

	it("includes the date when the estimate is on another Lagos day", () => {
		expect(
			formatReadyEstimateTime(
				"2026-07-31T00:30:00.000Z",
				sameDayReference,
			),
		).toBe("31 Jul, 1:30 AM");
	});

	it("omits the note when no valid estimate exists", () => {
		const note = readyEstimateNoteForTimelineStep(
			{
				status: "ACCEPTED",
				fulfillmentType: "PICKUP",
				expectedReadyAt: "not-a-date",
			},
			"ACCEPTED",
			sameDayReference,
		);
		expect(note).toBeNull();
	});
});
