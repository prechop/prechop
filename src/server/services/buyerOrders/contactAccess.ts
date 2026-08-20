import {
	ErrForbidden,
	ErrOrderNotFound,
	invalidOrderState,
	normalizeNigerianMobilePhone,
} from "@/server/constants";
import {
	appendBuyerOrderTimelineDB,
	FulfillmentType,
	getBuyerOrderByIdDB,
	getUserByIdDB,
	getVendorProfileByIdDB,
	getVendorProfileByUserIdDB,
	OrderStatus,
} from "@/server/models";

type ContactTarget = "buyer" | "kitchen";

export interface OrderContactReveal {
	target: ContactTarget;
	orderId: string;
	orderNumber: string;
	buyerName?: string | null;
	phone?: string;
	telUrl?: string;
	whatsappUrl?: string;
	location?: string | null;
	address?: string;
	deliveryHostelName?: string;
	deliveryRoomNumber?: string;
	deliveryAdditionalInfo?: string;
	checkoutNote?: string;
	instructions?: string[];
}

const ACTIVE_CONTACT_STATUSES = new Set<OrderStatus>([
	OrderStatus.ACCEPTED,
	OrderStatus.CONFIRMED,
	OrderStatus.COOKING,
	OrderStatus.PREPARING,
	OrderStatus.READY,
	OrderStatus.READY_FOR_PICKUP,
	OrderStatus.READY_FOR_DELIVERY,
	OrderStatus.IN_TRANSIT,
	OrderStatus.AWAITING_BUYER_NO_SHOW_RESPONSE,
	OrderStatus.PICKUP_PROBLEM_REPORTED,
	OrderStatus.BUYER_UNREACHABLE_REPORTED,
]);

function pickupLocation(
	vendor: Awaited<ReturnType<typeof getVendorProfileByIdDB>>,
) {
	if (!vendor) return null;
	return (
		[vendor.hostelOrStallName, vendor.areaOrAddress]
			.map((part) => part?.trim())
			.filter(Boolean)
			.join(" - ") || null
	);
}

function phoneLinks(phone?: string) {
	const clean = phone
		? (normalizeNigerianMobilePhone(phone) ?? phone.trim())
		: "";
	if (!clean) return {};
	const whatsappNumber = clean.replace(/[^\d]/g, "");
	return {
		phone: clean,
		telUrl: `tel:${clean}`,
		whatsappUrl: whatsappNumber
			? `https://wa.me/${whatsappNumber}`
			: undefined,
	};
}

function deliveryAddress(order: {
	deliveryFullAddress?: string;
	deliveryHostelName?: string;
	deliveryRoomNumber?: string;
	deliveryAdditionalInfo?: string;
}) {
	return (
		order.deliveryFullAddress ||
		[
			order.deliveryHostelName,
			order.deliveryRoomNumber,
			order.deliveryAdditionalInfo,
		]
			.map((part) => part?.trim())
			.filter(Boolean)
			.join(", ")
	);
}

function compactInstructions(...values: Array<string | undefined>) {
	return values.map((value) => value?.trim()).filter(Boolean) as string[];
}

function userDisplayName(user: Awaited<ReturnType<typeof getUserByIdDB>>) {
	if (!user) return null;
	return (
		[user.firstName, user.lastName]
			.map((part) => part?.trim())
			.filter(Boolean)
			.join(" ") || null
	);
}

function assertActiveAcceptedOrder(status: OrderStatus) {
	if (!ACTIVE_CONTACT_STATUSES.has(status)) {
		throw invalidOrderState(
			"Contact details are available only for active accepted orders.",
		);
	}
}

async function logContactReveal({
	orderId,
	actor,
	actorId,
	target,
}: {
	orderId: string;
	actor: "buyer" | "vendor";
	actorId: string;
	target: ContactTarget;
}) {
	await appendBuyerOrderTimelineDB({
		id: orderId,
		entry: {
			at: new Date(),
			type: "ORDER_CONTACT_REVEALED",
			actor,
			actorId,
			data: { target },
		},
	});
}

export async function revealBuyerContactForVendor({
	vendorUserId,
	orderId,
}: {
	vendorUserId: string;
	orderId: string;
}): Promise<OrderContactReveal> {
	const vendor = await getVendorProfileByUserIdDB({ userId: vendorUserId });
	if (!vendor) throw ErrForbidden;

	const order = await getBuyerOrderByIdDB({ id: orderId });
	if (!order) throw ErrOrderNotFound;
	if (order.vendorId.toString() !== vendor._id.toString()) throw ErrForbidden;
	if (order.fulfillmentType !== FulfillmentType.DELIVERY) {
		throw invalidOrderState(
			"Buyer delivery contact is for delivery orders.",
		);
	}
	assertActiveAcceptedOrder(order.status as OrderStatus);

	const address = deliveryAddress(order);
	if (!order.deliveryPhone?.trim() && !address) {
		throw invalidOrderState(
			"This order has no delivery contact to reveal.",
		);
	}
	const buyer = await getUserByIdDB({ id: order.buyerId.toString() });

	await logContactReveal({
		orderId,
		actor: "vendor",
		actorId: vendorUserId,
		target: "buyer",
	});

	return {
		target: "buyer",
		orderId,
		orderNumber: order.orderNumber,
		buyerName: userDisplayName(buyer),
		...phoneLinks(order.deliveryPhone),
		address,
		deliveryHostelName: order.deliveryHostelName,
		deliveryRoomNumber: order.deliveryRoomNumber,
		deliveryAdditionalInfo: order.deliveryAdditionalInfo,
		checkoutNote: order.customerMessage?.trim() || undefined,
	};
}

export async function revealKitchenContactForBuyer({
	buyerId,
	orderId,
}: {
	buyerId: string;
	orderId: string;
}): Promise<OrderContactReveal> {
	const order = await getBuyerOrderByIdDB({ id: orderId });
	if (!order) throw ErrOrderNotFound;
	if (order.buyerId.toString() !== buyerId) throw ErrForbidden;
	if (order.fulfillmentType !== FulfillmentType.PICKUP) {
		throw invalidOrderState("Kitchen pickup contact is for pickup orders.");
	}
	assertActiveAcceptedOrder(order.status as OrderStatus);

	const vendor = await getVendorProfileByIdDB({
		id: order.vendorId.toString(),
	});
	if (!vendor) throw ErrForbidden;

	await logContactReveal({
		orderId,
		actor: "buyer",
		actorId: buyerId,
		target: "kitchen",
	});

	return {
		target: "kitchen",
		orderId,
		orderNumber: order.orderNumber,
		...phoneLinks(vendor.contactPhone),
		location: pickupLocation(vendor),
		instructions: compactInstructions(
			"Show your QR or PIN only when collecting the order.",
		),
	};
}
