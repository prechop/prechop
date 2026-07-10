import mongoose from "mongoose";
import {
	conflict,
	ErrCannotOrderOwnListing,
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
		selectedOptionIds?: string[];
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

	// ── 2. Resolve requested items + options against the snapshotted listing ─
	const resolvedItems: IBuyerOrderItem[] = input.items.map((req) => {
		const orderItem = dailyOrder.items.find(
			(i) => (i.id ?? i._id)?.toString() === req.dailyOrderItemId,
		);
		if (!orderItem) throw notFound("Item");

		const selectedIds = new Set(req.selectedOptionIds ?? []);
		const resolvedOptions: IBuyerOrderItem["selectedOptions"] = [];

		// Walk the item's option groups, enforcing each group's rules and
		// collecting the buyer's chosen options (server-authoritative pricing).
		for (const group of orderItem.optionGroups ?? []) {
			const chosen = group.options.filter((o) =>
				selectedIds.has((o.id ?? o._id)?.toString() ?? ""),
			);
			const min = group.required
				? Math.max(1, group.minSelect ?? 0)
				: (group.minSelect ?? 0);
			if (chosen.length < min) {
				throw validationError(
					`Please choose ${min} option${min === 1 ? "" : "s"} for "${group.name}".`,
				);
			}
			if (group.maxSelect != null && chosen.length > group.maxSelect) {
				throw validationError(
					`You can choose at most ${group.maxSelect} option${
						group.maxSelect === 1 ? "" : "s"
					} for "${group.name}".`,
				);
			}
			for (const o of chosen) {
				(o.id ?? o._id)?.toString() &&
					selectedIds.delete((o.id ?? o._id)?.toString() ?? "");
				resolvedOptions.push({
					dailyOrderOptionId: (o.id ?? o._id)?.toString(),
					groupName: group.name,
					snapshotName: o.name,
					snapshotPriceKobo: o.priceKobo,
					quantity: req.quantity,
					subtotalKobo: o.priceKobo * req.quantity,
				});
			}
		}
		// Any leftover selected id didn't belong to this item's groups.
		if (selectedIds.size > 0) throw notFound("Option");

		const optionsSubtotal = resolvedOptions.reduce(
			(s, a) => s + a.subtotalKobo,
			0,
		);
		const itemSubtotal =
			orderItem.snapshotPriceKobo * req.quantity + optionsSubtotal;

		return {
			dailyOrderItemId: (orderItem.id ?? orderItem._id)?.toString() ?? "",
			menuItemId: orderItem.menuItemId?.toString(),
			snapshotName: orderItem.snapshotName,
			snapshotPriceKobo: orderItem.snapshotPriceKobo,
			quantity: req.quantity,
			subtotalKobo: itemSubtotal,
			selectedOptions: resolvedOptions,
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
	// A seller cannot buy from their own kitchen. This is the authoritative,
	// modeled invariant protecting every entry point (public order page, API,
	// anything future) — checked before any slot reservation or payment side
	// effect. `buyerId` refs `users`; the listing's `vendorId` refs
	// `vendorProfiles`, so we compare against the profile's owning `userId`.
	if (vendor.userId?.toString() === buyerId) throw ErrCannotOrderOwnListing;
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
