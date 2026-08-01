import type { OrderStatus } from "@/types";

export const PRECHOP_TIME_ZONE = "Africa/Lagos";

type FulfillmentKind = "PICKUP" | "DELIVERY";

export interface OrderReadyEstimateSnapshot {
	status: OrderStatus;
	fulfillmentType: FulfillmentKind;
	expectedReadyAt?: string | Date | null;
	revisedReadyAt?: string | Date | null;
	lateMarkedAt?: string | Date | null;
	readyAt?: string | Date | null;
}

export interface TimelineEstimateNote {
	lines: string[];
}

function validDate(value?: string | Date | null): Date | null {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isFinite(date.getTime()) ? date : null;
}

function partsKey(date: Date, timeZone: string) {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(date);
	const get = (type: string) =>
		parts.find((part) => part.type === type)?.value ?? "";
	return `${get("year")}-${get("month")}-${get("day")}`;
}

function uppercaseMeridiem(value: string) {
	return value.replace(/\b(am|pm)\b/g, (match) => match.toUpperCase());
}

export function formatReadyEstimateTime(
	value: string | Date,
	reference: string | Date = new Date(),
	timeZone = PRECHOP_TIME_ZONE,
) {
	const date = validDate(value);
	const ref = validDate(reference);
	if (!date || !ref) return null;
	const sameDay = partsKey(date, timeZone) === partsKey(ref, timeZone);
	const options: Intl.DateTimeFormatOptions = sameDay
		? { hour: "numeric", minute: "2-digit", hour12: true, timeZone }
		: {
				day: "numeric",
				month: "short",
				hour: "numeric",
				minute: "2-digit",
				hour12: true,
				timeZone,
			};
	return uppercaseMeridiem(
		new Intl.DateTimeFormat("en-NG", options).format(date),
	);
}

export function effectiveReadyEstimate(
	order: OrderReadyEstimateSnapshot,
): Date | null {
	return validDate(order.revisedReadyAt) ?? validDate(order.expectedReadyAt);
}

function readyStepFor(fulfillmentType: FulfillmentKind): OrderStatus {
	return fulfillmentType === "DELIVERY"
		? "READY_FOR_DELIVERY"
		: "READY_FOR_PICKUP";
}

function timelineStageFor(
	status: OrderStatus,
	fulfillmentType: FulfillmentKind,
): OrderStatus {
	if (status === "CONFIRMED") return "ACCEPTED";
	if (status === "PREPARING") return "COOKING";
	if (status === "READY") return readyStepFor(fulfillmentType);
	return status;
}

export function readyEstimateNoteForTimelineStep(
	order: OrderReadyEstimateSnapshot,
	stepStatus: OrderStatus,
	reference: string | Date = new Date(),
): TimelineEstimateNote | null {
	const readyAt = validDate(order.readyAt);
	if (stepStatus === readyStepFor(order.fulfillmentType) && readyAt) {
		const formatted = formatReadyEstimateTime(readyAt, reference);
		return formatted ? { lines: [`Ready at ${formatted}`] } : null;
	}

	const activeStage = timelineStageFor(order.status, order.fulfillmentType);
	if (stepStatus !== activeStage) return null;
	if (activeStage !== "ACCEPTED" && activeStage !== "COOKING") return null;

	const original = validDate(order.expectedReadyAt);
	const revised = validDate(order.revisedReadyAt);
	const isLate = !!validDate(order.lateMarkedAt);
	if (isLate) {
		const lines: string[] = [];
		const originalText = original
			? formatReadyEstimateTime(original, reference)
			: null;
		const revisedText = revised
			? formatReadyEstimateTime(revised, reference)
			: null;
		if (originalText) lines.push(`Original estimate: ${originalText}`);
		if (revisedText) lines.push(`Updated estimate: ${revisedText}`);
		return lines.length > 0 ? { lines } : null;
	}

	const effective = effectiveReadyEstimate(order);
	const formatted = effective
		? formatReadyEstimateTime(effective, reference)
		: null;
	return formatted ? { lines: [`Estimated ready by ${formatted}`] } : null;
}
