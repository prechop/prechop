import { describe, expect, it } from "vitest";
import {
  canonicalOrderStatus,
  handoverUnavailableMessage,
  isBuyerHandoverEligible,
  isVendorPipelineCompletedStatus,
  orderFlowForFulfillment,
  orderTimelineSteps,
  pickupNoShowAvailability,
  pickupNoShowResponseWindow,
} from "@/constants/orderLifecycle";

describe("order lifecycle mapping", () => {
  it("marks accepted as the current buyer timeline stage after vendor acceptance", () => {
    const timeline = orderTimelineSteps("PICKUP");
    const current = canonicalOrderStatus("ACCEPTED", "PICKUP");
    expect(timeline.findIndex((step) => step.status === current)).toBe(1);
    expect(timeline[0].label).toBe("Awaiting vendor acceptance");
    expect(timeline[1].label).toBe("Accepted");
  });

  it("keeps pickup wording out of the delivery timeline", () => {
    const labels = orderTimelineSteps("DELIVERY").map((step) => step.label);
    expect(labels).toEqual([
      "Awaiting vendor acceptance",
      "Accepted",
      "Cooking",
      "Ready for delivery",
      "In transit",
      "Delivered",
      "Completed",
    ]);
    expect(labels).not.toContain("Ready for pickup");
    expect(labels).not.toContain("Picked up");
  });

  it("keeps delivery-only on-the-way wording out of the pickup timeline", () => {
    const labels = orderTimelineSteps("PICKUP").map((step) => step.label);
    expect(labels).toEqual([
      "Awaiting vendor acceptance",
      "Accepted",
      "Cooking",
      "Ready for pickup",
      "Picked up",
      "Completed",
    ]);
    expect(labels).not.toContain("In transit");
    expect(labels).not.toContain("Ready for delivery");
  });

  it("maps old READY rows to the correct fulfilment-specific ready stage", () => {
    expect(canonicalOrderStatus("READY", "PICKUP")).toBe("READY_FOR_PICKUP");
    expect(canonicalOrderStatus("READY", "DELIVERY")).toBe(
      "READY_FOR_DELIVERY",
    );
  });

  it("exposes handover only at pickup ready or delivery in transit", () => {
    expect(isBuyerHandoverEligible("ACCEPTED", "PICKUP", null)).toBe(false);
    expect(isBuyerHandoverEligible("READY_FOR_PICKUP", "PICKUP", null)).toBe(
      true,
    );
    expect(
      isBuyerHandoverEligible("READY_FOR_DELIVERY", "DELIVERY", null),
    ).toBe(false);
    expect(isBuyerHandoverEligible("IN_TRANSIT", "DELIVERY", null)).toBe(true);
    expect(isBuyerHandoverEligible("IN_TRANSIT", "DELIVERY", new Date())).toBe(
      false,
    );
  });

  it.each([
    "READY",
    "READY_FOR_PICKUP",
  ] as const)("enables pickup no-show for %s only after 120 minutes", (status) => {
    const readyAt = "2026-08-08T08:00:00.000Z";
    expect(
      pickupNoShowAvailability(
        status,
        "PICKUP",
        readyAt,
        new Date("2026-08-08T09:59:59.999Z").getTime(),
      ),
    ).toMatchObject({ available: false });
    expect(
      pickupNoShowAvailability(
        status,
        "PICKUP",
        readyAt,
        new Date("2026-08-08T10:00:00.000Z").getTime(),
      ),
    ).toEqual({
      available: true,
      availableAt: new Date("2026-08-08T10:00:00.000Z"),
    });
  });

  it("does not expose pickup no-show for delivery orders", () => {
    expect(
      pickupNoShowAvailability(
        "READY_FOR_DELIVERY",
        "DELIVERY",
        "2026-08-08T08:00:00.000Z",
      ),
    ).toBeNull();
  });

  it("tracks the buyer response deadline down to expiry", () => {
    const deadline = "2026-08-08T10:15:00.000Z";
    expect(
      pickupNoShowResponseWindow(
        deadline,
        new Date("2026-08-08T10:02:55.000Z").getTime(),
      ),
    ).toEqual({
      deadline: new Date(deadline),
      expired: false,
      remainingMs: 725_000,
      countdown: "12:05 remaining",
    });
    expect(
      pickupNoShowResponseWindow(deadline, new Date(deadline).getTime()),
    ).toMatchObject({
      expired: true,
      remainingMs: 0,
      countdown: "Response window closed",
    });
  });

  it("keeps buyer no-show completion in vendor pipeline history", () => {
    expect(isVendorPipelineCompletedStatus("COMPLETED")).toBe(true);
    expect(isVendorPipelineCompletedStatus("COMPLETED_BUYER_NO_SHOW")).toBe(
      true,
    );
    expect(
      isVendorPipelineCompletedStatus("AWAITING_BUYER_NO_SHOW_RESPONSE"),
    ).toBe(false);
  });

  it("uses canonical backend status sequences", () => {
    expect(orderFlowForFulfillment("PICKUP")).toEqual([
      "AWAITING_VENDOR_ACCEPTANCE",
      "ACCEPTED",
      "COOKING",
      "READY_FOR_PICKUP",
      "PICKED_UP",
      "COMPLETED",
    ]);
    expect(orderFlowForFulfillment("DELIVERY")).toEqual([
      "AWAITING_VENDOR_ACCEPTANCE",
      "ACCEPTED",
      "COOKING",
      "READY_FOR_DELIVERY",
      "IN_TRANSIT",
      "DELIVERED",
      "COMPLETED",
    ]);
  });

  it("returns clear handover unavailable messages", () => {
    expect(handoverUnavailableMessage("PICKUP")).toBe(
      "Handover code becomes available when the order is ready for pickup.",
    );
    expect(handoverUnavailableMessage("DELIVERY")).toBe(
      "Handover code becomes available when the order is In transit.",
    );
  });
});
