import type { OrderStatus } from "@/types";

export type FulfillmentKind = "PICKUP" | "DELIVERY";

export type LifecycleStep = {
  status: OrderStatus;
  label: string;
  hint: string;
  icon: string;
};

export const PICKUP_NO_SHOW_WAIT_MINUTES = 120;
const PICKUP_NO_SHOW_WAIT_MS = PICKUP_NO_SHOW_WAIT_MINUTES * 60 * 1000;

export type PickupNoShowAvailability = {
  available: boolean;
  availableAt: Date | null;
};

export type PickupNoShowResponseWindow = {
  deadline: Date | null;
  expired: boolean;
  remainingMs: number | null;
  countdown: string;
};

export const VENDOR_PIPELINE_COMPLETED_STATUSES: OrderStatus[] = [
  "COMPLETED",
  "COMPLETED_BUYER_NO_SHOW",
];

export const PICKUP_FLOW: OrderStatus[] = [
  "AWAITING_VENDOR_ACCEPTANCE",
  "ACCEPTED",
  "COOKING",
  "READY_FOR_PICKUP",
  "PICKED_UP",
  "COMPLETED",
];

export const DELIVERY_FLOW: OrderStatus[] = [
  "AWAITING_VENDOR_ACCEPTANCE",
  "ACCEPTED",
  "COOKING",
  "READY_FOR_DELIVERY",
  "IN_TRANSIT",
  "DELIVERED",
  "COMPLETED",
];

const LEGACY_READY_BY_FULFILLMENT: Record<FulfillmentKind, OrderStatus> = {
  PICKUP: "READY_FOR_PICKUP",
  DELIVERY: "READY_FOR_DELIVERY",
};

export function canonicalOrderStatus(
  status: OrderStatus,
  fulfillmentType: FulfillmentKind,
): OrderStatus {
  return status === "READY"
    ? LEGACY_READY_BY_FULFILLMENT[fulfillmentType]
    : status;
}

export function orderFlowForFulfillment(
  fulfillmentType: FulfillmentKind,
): OrderStatus[] {
  return fulfillmentType === "DELIVERY" ? DELIVERY_FLOW : PICKUP_FLOW;
}

export function nextVendorOrderAction(
  status: OrderStatus,
  fulfillmentType: FulfillmentKind,
): { to: OrderStatus; label: string } | null {
  if (status === "AWAITING_VENDOR_ACCEPTANCE") {
    return { to: "ACCEPTED", label: "Accept order" };
  }
  if (status === "ACCEPTED") {
    return { to: "COOKING", label: "Start cooking" };
  }
  if (status === "COOKING" || status === "PREPARING") {
    return fulfillmentType === "DELIVERY"
      ? { to: "READY_FOR_DELIVERY", label: "Ready for delivery" }
      : { to: "READY_FOR_PICKUP", label: "Ready for pickup" };
  }
  if (
    fulfillmentType === "DELIVERY" &&
    (status === "READY_FOR_DELIVERY" || status === "READY")
  ) {
    return { to: "IN_TRANSIT", label: "Start delivery" };
  }
  return null;
}

export function isVendorStatusTransitionAllowed(
  from: OrderStatus,
  to: OrderStatus,
  fulfillmentType: FulfillmentKind,
) {
  const next = nextVendorOrderAction(from, fulfillmentType);
  if (next?.to === to) return true;
  if (from === "AWAITING_VENDOR_ACCEPTANCE" && to === "VENDOR_REJECTED") {
    return true;
  }
  if (from === "PAID" && to === "CONFIRMED") return true;
  if (from === "CONFIRMED" && to === "PREPARING") return true;
  return false;
}

export function isBuyerHandoverEligible(
  status: OrderStatus,
  fulfillmentType: FulfillmentKind,
  handoverCredentialUsedAt?: string | Date | null,
) {
  if (handoverCredentialUsedAt != null) return false;
  const canonical = canonicalOrderStatus(status, fulfillmentType);
  return fulfillmentType === "DELIVERY"
    ? canonical === "IN_TRANSIT"
    : canonical === "READY_FOR_PICKUP";
}

export function pickupNoShowAvailability(
  status: OrderStatus,
  fulfillmentType: FulfillmentKind,
  readyAt?: string | Date | null,
  now = Date.now(),
): PickupNoShowAvailability | null {
  if (
    fulfillmentType !== "PICKUP" ||
    canonicalOrderStatus(status, fulfillmentType) !== "READY_FOR_PICKUP"
  ) {
    return null;
  }

  const readyTime = readyAt == null ? Number.NaN : new Date(readyAt).getTime();
  if (!Number.isFinite(readyTime)) {
    return { available: false, availableAt: null };
  }

  const availableAt = new Date(readyTime + PICKUP_NO_SHOW_WAIT_MS);
  return { available: now >= availableAt.getTime(), availableAt };
}

export function pickupNoShowResponseWindow(
  responseDeadline?: string | Date | null,
  now = Date.now(),
): PickupNoShowResponseWindow {
  const deadlineTime =
    responseDeadline == null
      ? Number.NaN
      : new Date(responseDeadline).getTime();
  if (!Number.isFinite(deadlineTime)) {
    return {
      deadline: null,
      expired: false,
      remainingMs: null,
      countdown: "Response deadline unavailable",
    };
  }

  const deadline = new Date(deadlineTime);
  const remainingMs = Math.max(0, deadlineTime - now);
  if (remainingMs === 0) {
    return {
      deadline,
      expired: true,
      remainingMs,
      countdown: "Response window closed",
    };
  }

  const minutes = Math.floor(remainingMs / 60_000);
  const seconds = Math.floor((remainingMs % 60_000) / 1000);
  return {
    deadline,
    expired: false,
    remainingMs,
    countdown: `${minutes}:${String(seconds).padStart(2, "0")} remaining`,
  };
}

export function isVendorPipelineCompletedStatus(status: OrderStatus) {
  return VENDOR_PIPELINE_COMPLETED_STATUSES.includes(status);
}

export function handoverUnavailableMessage(fulfillmentType: FulfillmentKind) {
  return fulfillmentType === "DELIVERY"
    ? "Handover code becomes available when the order is In transit."
    : "Handover code becomes available when the order is ready for pickup.";
}

export function orderTimelineSteps(
  fulfillmentType: FulfillmentKind,
): LifecycleStep[] {
  const pickup: LifecycleStep[] = [
    {
      status: "AWAITING_VENDOR_ACCEPTANCE",
      label: "Awaiting vendor acceptance",
      hint: "Waiting for the kitchen to accept",
      icon: "clock",
    },
    {
      status: "ACCEPTED",
      label: "Accepted",
      hint: "The kitchen accepted your order",
      icon: "check",
    },
    {
      status: "COOKING",
      label: "Cooking",
      hint: "Your food is being cooked",
      icon: "cook",
    },
    {
      status: "READY_FOR_PICKUP",
      label: "Ready for pickup",
      hint: "Go to the pickup point and show your QR or PIN",
      icon: "package",
    },
    {
      status: "PICKED_UP",
      label: "Picked up",
      hint: "Pickup confirmed by QR or PIN",
      icon: "check",
    },
    {
      status: "COMPLETED",
      label: "Completed",
      hint: "Order fulfilled - enjoy!",
      icon: "done",
    },
  ];
  if (fulfillmentType === "PICKUP") return pickup;
  return [
    ...pickup.slice(0, 3),
    {
      status: "READY_FOR_DELIVERY",
      label: "Ready for delivery",
      hint: "The order is ready for the rider",
      icon: "package",
    },
    {
      status: "IN_TRANSIT",
      label: "In transit",
      hint: "Your order is In transit",
      icon: "truck",
    },
    {
      status: "DELIVERED",
      label: "Delivered",
      hint: "Delivery confirmed by QR or PIN",
      icon: "check",
    },
    pickup[pickup.length - 1],
  ];
}
