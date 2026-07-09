import mongoose from "mongoose";
import {
	conflict,
	ErrCutoffPassed,
	ErrDailyOrderNotActive,
	ErrDailyOrderNotFound,
	ErrVendorNotFound,
	generateOrderNumber,
	generatePaystackRef,
	hash,
	koboToNaira,
	notFound,
	slotUnavailable,
	sumKobo,
	validationError,
} from "../../constants";
import {
	createBuyerOrderDB,
	createPaymentDB,
	DailyOrderStatus,
	deleteBuyerOrderHardDB,
	FulfillmentType,
	getDailyOrderByIdDB,
	getVendorProfileByIdDB,
} from "../../models";
import type { IBuyerOrderItem } from "../../models/buyerOrders/types";
import { paystackProvider } from "../../providers";
import { getSiteConfigs } from "../siteConfigs";
import { releaseSlots, reserveSlots, type SlotRequest } from "./slots";

export interface PlaceOrderInput {
	dailyOrderId: string;
	fulfillmentType: FulfillmentType;
	deliveryHostelName?: string;
	deliveryRoomNumber?: string;
	deliveryAdditionalInfo?: string;
	items: Array<{
		dailyOrderItemId: string;
		quantity: number;
		selectedAddonIds?: string[];
	}>;
}

export async function placeOrder({
	buyerId,
	campusId,
	input,
}: {
	buyerId: string;
	campusId: string;
	input: PlaceOrderInput;
}) {
	const config = await getSiteConfigs();
	if (config.ordersKillSwitch || config.paymentsKillSwitch) {
		throw validationError(
			"Ordering is temporarily unavailable. Please try again shortly.",
		);
	}

	// ── 1. Load + validate the daily order ──────────────────────────────
	const dailyOrder = await getDailyOrderByIdDB({ id: input.dailyOrderId });
	if (!dailyOrder) throw ErrDailyOrderNotFound;
	if (dailyOrder.status !== DailyOrderStatus.ACTIVE)
		throw ErrDailyOrderNotActive;
	// "Coming soon": ordering hasn't opened yet for this listing.
	if (
		dailyOrder.availableFrom &&
		dailyOrder.availableFrom.getTime() > Date.now()
	)
		throw conflict(
			"Ordering hasn't opened for this listing yet. Please check back at the start time.",
		);
	if (dailyOrder.cutoffTime.getTime() <= Date.now()) throw ErrCutoffPassed;

	if (
		input.fulfillmentType === FulfillmentType.PICKUP &&
		!dailyOrder.pickupAvailable
	) {
		throw validationError("Pickup is not available for this order.");
	}
	if (
		input.fulfillmentType === FulfillmentType.DELIVERY &&
		!dailyOrder.deliveryAvailable
	) {
		throw validationError("Delivery is not available for this order.");
	}

	// ── 2. Resolve requested items + addons against the snapshotted listing ─
	const resolvedItems: IBuyerOrderItem[] = input.items.map((req) => {
		const orderItem = dailyOrder.items.find(
			(i) => (i.id ?? i._id)?.toString() === req.dailyOrderItemId,
		);
		if (!orderItem) throw notFound("Item");

		const resolvedAddons = (req.selectedAddonIds ?? []).map((addonId) => {
			const addon = orderItem.addons.find(
				(a) => (a.id ?? a._id)?.toString() === addonId,
			);
			if (!addon) throw notFound("Add-on");
			return {
				dailyOrderItemAddonId: (addon.id ?? addon._id)?.toString(),
				snapshotName: addon.name,
				snapshotPriceKobo: addon.priceKobo,
				quantity: req.quantity,
				subtotalKobo: addon.priceKobo * req.quantity,
			};
		});

		const addonSubtotal = resolvedAddons.reduce(
			(s, a) => s + a.subtotalKobo,
			0,
		);
		const itemSubtotal =
			orderItem.snapshotPriceKobo * req.quantity + addonSubtotal;

		return {
			dailyOrderItemId: (orderItem.id ?? orderItem._id)?.toString() ?? "",
			menuItemId: orderItem.menuItemId?.toString(),
			snapshotName: orderItem.snapshotName,
			snapshotPriceKobo: orderItem.snapshotPriceKobo,
			quantity: req.quantity,
			subtotalKobo: itemSubtotal,
			addons: resolvedAddons,
		};
	});

	// ── 3. Totals (server-authoritative) ────────────────────────────────
	const subtotalKobo = sumKobo(...resolvedItems.map((i) => i.subtotalKobo));
	const deliveryFeeKobo =
		input.fulfillmentType === FulfillmentType.DELIVERY
			? dailyOrder.deliveryFeeKobo
			: 0;
	const platformFeeKobo = config.platformFeeBuyerKobo;
	const totalKobo = sumKobo(subtotalKobo, deliveryFeeKobo, platformFeeKobo);
	const vendorAmountKobo = Math.max(
		0,
		sumKobo(subtotalKobo, deliveryFeeKobo) - config.platformFeeVendorKobo,
	);

	// ── 4. Vendor payout account ─────────────────────────────────────────
	const vendor = await getVendorProfileByIdDB({ id: dailyOrder.vendorId });
	if (!vendor) throw ErrVendorNotFound;
	if (!vendor.paystackSubaccountCode) {
		throw validationError("Vendor payment account is not configured.");
	}

	// ── 5. Reserve slots (atomic oversell guard) ─────────────────────────
	const slotRequests: SlotRequest[] = resolvedItems.map((it) => {
		const listing = dailyOrder.items.find(
			(i) => (i.id ?? i._id)?.toString() === it.dailyOrderItemId,
		);
		return {
			dailyOrderItemId: it.dailyOrderItemId,
			quantity: it.quantity,
			committed: listing?.orderedQuantity ?? 0,
			maxQuantity: listing?.maxQuantity,
		};
	});
	const reservation = await reserveSlots(
		slotRequests,
		config.slotHoldTtlSeconds,
	);
	if (!reservation.ok) {
		const failed = resolvedItems.find(
			(i) => i.dailyOrderItemId === reservation.failedItemId,
		);
		throw slotUnavailable(failed?.snapshotName);
	}

	const buyerOrderId = new mongoose.Types.ObjectId().toString();
	const orderNumber = generateOrderNumber();
	const paystackRef = generatePaystackRef();
	const idempotencyKey = hash(`${buyerOrderId}-${paystackRef}`);
	const holds = resolvedItems.map((i) => ({
		dailyOrderItemId: i.dailyOrderItemId,
		quantity: i.quantity,
	}));

	// ── 6. Initialise Paystack (before any DB write) ─────────────────────
	const buyerEmail = `buyer-${buyerId}@prechop-orders.ng`;
	let paystackTx: { authorization_url: string; access_code: string };
	try {
		paystackTx = await paystackProvider.initializeTransaction({
			email: buyerEmail,
			amountKobo: totalKobo,
			reference: paystackRef,
			subaccountCode: vendor.paystackSubaccountCode,
			vendorAmountKobo,
			metadata: {
				buyerOrderId,
				dailyOrderId: input.dailyOrderId,
				vendorId: dailyOrder.vendorId,
				orderNumber,
			},
		});
	} catch (error) {
		await releaseSlots(holds);
		console.error("Paystack init failed:", error);
		throw validationError(
			"Payment initialisation failed. Please try again.",
		);
	}

	// ── 7. Persist order + payment ───────────────────────────────────────
	let deliveryFullAddress: string | undefined;
	if (input.fulfillmentType === FulfillmentType.DELIVERY) {
		deliveryFullAddress = [
			input.deliveryHostelName,
			input.deliveryRoomNumber,
			input.deliveryAdditionalInfo,
		]
			.filter(Boolean)
			.join(", ");
	}

	const order = await createBuyerOrderDB({
		id: buyerOrderId,
		payload: {
			orderNumber,
			dailyOrderId: input.dailyOrderId,
			vendorId: dailyOrder.vendorId,
			buyerId,
			campusId,
			fulfillmentType: input.fulfillmentType,
			deliveryHostelName: input.deliveryHostelName,
			deliveryRoomNumber: input.deliveryRoomNumber,
			deliveryAdditionalInfo: input.deliveryAdditionalInfo,
			deliveryFullAddress,
			subtotalKobo,
			deliveryFeeKobo,
			platformFeeKobo,
			totalKobo,
			items: resolvedItems,
		},
	});
	if (!order) {
		await releaseSlots(holds);
		throw validationError("Could not create your order. Please try again.");
	}

	const payment = await createPaymentDB({
		payload: {
			buyerOrderId,
			buyerId,
			vendorId: dailyOrder.vendorId,
			paystackRef,
			paystackAccessCode: paystackTx.access_code,
			amountKobo: totalKobo,
			platformFeeKobo,
			vendorAmountKobo,
			idempotencyKey,
		},
	});
	if (!payment) {
		await deleteBuyerOrderHardDB({ id: buyerOrderId });
		await releaseSlots(holds);
		throw validationError("Could not create your order. Please try again.");
	}

	// Holds intentionally remain until payment confirmation (webhook) or the
	// abandoned-order sweep releases them.
	return {
		orderNumber,
		buyerOrderId,
		paymentUrl: paystackTx.authorization_url,
		accessCode: paystackTx.access_code,
		paystackRef,
		totalKobo,
		totalNaira: koboToNaira(totalKobo),
	};
}
