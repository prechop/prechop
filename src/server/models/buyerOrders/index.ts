import mongoose, { type ClientSession, type Model } from "mongoose";
import { MAX_LIMIT } from "../../constants";
import { databaseResponseTimeHistogram } from "../../metrics";
import { FulfillmentType, OrderStatus, SETTLED_ORDER_STATUSES } from "../enums";
import { IOperationType, PLATFORM_TIMEZONE } from "../utils";
import type {
	IBuyerOrder,
	IBuyerOrderCreateInput,
	ReceiptStatus,
} from "./types";
import { RECEIPT_STATUSES } from "./types";

const collectionName = "buyerOrders";

export type BuyerOrderModel = Model<any>;

const selectedOptionSchema = new mongoose.Schema(
	{
		dailyOrderOptionId: { type: mongoose.Schema.Types.ObjectId },
		groupName: { type: String, required: true },
		snapshotName: { type: String, required: true },
		snapshotPriceKobo: { type: Number, required: true },
		quantity: { type: Number, required: true },
		subtotalKobo: { type: Number, required: true },
	},
	{ _id: false },
);

const itemSchema = new mongoose.Schema(
	{
		dailyOrderItemId: {
			type: mongoose.Schema.Types.ObjectId,
			required: true,
		},
		menuItemId: { type: mongoose.Schema.Types.ObjectId, ref: "menuItems" },
		snapshotName: { type: String, required: true },
		snapshotPriceKobo: { type: Number, required: true },
		quantity: { type: Number, required: true, min: 1 },
		subtotalKobo: { type: Number, required: true },
		selectedOptions: { type: [selectedOptionSchema], default: [] },
	},
	{ _id: false },
);

const schema = new mongoose.Schema<any>(
	{
		orderNumber: {
			type: String,
			required: true,
			unique: true,
			index: true,
		},
		dailyOrderId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "dailyOrders",
			required: true,
			index: true,
		},
		vendorId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "vendorProfiles",
			required: true,
			index: true,
		},
		buyerId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "users",
			required: true,
			index: true,
		},
		campusId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "campuses",
			required: true,
			index: true,
		},
		status: {
			type: String,
			enum: Object.values(OrderStatus),
			default: OrderStatus.PENDING_PAYMENT,
			index: true,
		},
		fulfillmentType: {
			type: String,
			enum: Object.values(FulfillmentType),
			required: true,
		},
		deliveryHostelName: { type: String },
		deliveryRoomNumber: { type: String },
		deliveryAdditionalInfo: { type: String },
		deliveryFullAddress: { type: String },
		subtotalKobo: { type: Number, required: true },
		deliveryFeeKobo: { type: Number, default: 0 },
		platformFeeKobo: { type: Number, required: true },
		paymentProcessingFeeKobo: { type: Number, default: 0 },
		prechopCommissionKobo: { type: Number, default: 0 },
		vendorFoodAmountKobo: { type: Number, default: 0 },
		vendorDeliveryAmountKobo: { type: Number, default: 0 },
		vendorSettlementKobo: { type: Number, default: 0 },
		totalKobo: { type: Number, required: true },
		cancellationReason: { type: String },
		cancelledBy: { type: String, enum: ["buyer", "vendor", "system"] },
		paidAt: { type: Date },
		channel: { type: String },
		receiptUrl: { type: String },
		// No `default` on purpose — see types.ts. Absent = pre-feature order, and
		// the UI keys "render nothing" off exactly that absence. Defaulting to
		// PENDING would make every historical order advertise a receipt that no
		// job will ever produce.
		receiptStatus: { type: String, enum: RECEIPT_STATUSES },
		items: { type: [itemSchema], default: [] },
	},
	{ timestamps: true },
);

schema.index({ vendorId: 1, dailyOrderId: 1 });
schema.index({ buyerId: 1, createdAt: -1 });
schema.index({ receiptUrl: 1 }, { sparse: true });
// NOTE: the stale-PAID-past-cutoff sweep (findStalePaidOrdersPastCutoffDB) is
// served by the existing `status_1` index above. A compound
// {status:1, dailyOrderId:1} was tried and measured: the planner rejects it
// (the sweep must FETCH whole docs to act on them, so the extra key buys no
// covering) and it only added write amplification. Do not re-add it.
// Hourly review-prompt sweep (listBuyerOrdersDB with filter
// {status: COMPLETED, updatedAt: range} — services/notifications/reviewPrompts.ts).
// `status_1` alone gives status equality but must then FETCH every COMPLETED order
// ever written to filter updatedAt in memory: measured at 400k it examined 335652
// docs (~422ms). With updatedAt in the key the planner narrows straight to the
// window (examined 213, ~6ms) and selects this index over status_1. COMPLETED grows
// without bound, so the pre-index cost widens with order history.
schema.index({ status: 1, updatedAt: 1 });
// Nightly analytics driver (aggregateVendorDailyStatsDB $match {createdAt: dayRange}).
// No unprefixed createdAt index existed — `buyerId_1_createdAt_-1` is buyerId-prefixed
// so a bare createdAt range can't use it — and the $match COLLSCANned all 400k docs
// (~243ms). This turns it into an IXSCAN (examined 1124, ~8ms).
schema.index({ createdAt: 1 });

schema.pre("aggregate", function () {
	this.pipeline().push({
		$addFields: {
			id: { $toString: "$_id" },
			items: {
				$map: {
					input: { $ifNull: ["$items", []] },
					as: "it",
					in: {
						$mergeObjects: [
							"$$it",
							{ id: { $toString: "$$it.dailyOrderItemId" } },
						],
					},
				},
			},
		},
	});
	this.pipeline().push({ $project: { __v: 0 } });
});

export const BuyerOrder: BuyerOrderModel =
	(mongoose.models[collectionName] as BuyerOrderModel | undefined) ??
	mongoose.model<any>(collectionName, schema);

function mapItems(items: IBuyerOrderCreateInput["items"]) {
	return items.map((it) => ({
		dailyOrderItemId: new mongoose.Types.ObjectId(it.dailyOrderItemId),
		menuItemId: it.menuItemId
			? new mongoose.Types.ObjectId(it.menuItemId)
			: undefined,
		snapshotName: it.snapshotName,
		snapshotPriceKobo: it.snapshotPriceKobo,
		quantity: it.quantity,
		subtotalKobo: it.subtotalKobo,
		selectedOptions: (it.selectedOptions ?? []).map((a) => ({
			dailyOrderOptionId:
				a.dailyOrderOptionId &&
				mongoose.Types.ObjectId.isValid(a.dailyOrderOptionId)
					? new mongoose.Types.ObjectId(a.dailyOrderOptionId)
					: undefined,
			groupName: a.groupName,
			snapshotName: a.snapshotName,
			snapshotPriceKobo: a.snapshotPriceKobo,
			quantity: a.quantity,
			subtotalKobo: a.subtotalKobo,
		})),
	}));
}

export async function createBuyerOrderDB({
	id,
	payload,
	session,
}: {
	// Pre-generated ObjectId so the caller can build lock keys before insert.
	id?: string;
	payload: IBuyerOrderCreateInput;
	session?: ClientSession;
}): Promise<IBuyerOrder | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		const doc = await new BuyerOrder({
			...(id ? { _id: new mongoose.Types.ObjectId(id) } : {}),
			orderNumber: payload.orderNumber,
			dailyOrderId: payload.dailyOrderId,
			vendorId: payload.vendorId,
			buyerId: payload.buyerId,
			campusId: payload.campusId,
			status: payload.status,
			fulfillmentType: payload.fulfillmentType,
			deliveryHostelName: payload.deliveryHostelName,
			deliveryRoomNumber: payload.deliveryRoomNumber,
			deliveryAdditionalInfo: payload.deliveryAdditionalInfo,
			deliveryFullAddress: payload.deliveryFullAddress,
			subtotalKobo: payload.subtotalKobo,
			deliveryFeeKobo: payload.deliveryFeeKobo,
			platformFeeKobo: payload.platformFeeKobo,
			paymentProcessingFeeKobo: payload.paymentProcessingFeeKobo ?? 0,
			prechopCommissionKobo: payload.prechopCommissionKobo ?? 0,
			vendorFoodAmountKobo: payload.vendorFoodAmountKobo ?? 0,
			vendorDeliveryAmountKobo: payload.vendorDeliveryAmountKobo ?? 0,
			vendorSettlementKobo: payload.vendorSettlementKobo ?? 0,
			totalKobo: payload.totalKobo,
			items: mapItems(payload.items),
		}).save({ session });
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createBuyerOrderDB",
			success: "true",
		});
		return doc.toObject() as unknown as IBuyerOrder;
	} catch {
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createBuyerOrderDB",
			success: "false",
		});
		return null;
	}
}

/** Compensating delete when a downstream write (payment init) fails. */
export async function deleteBuyerOrderHardDB({
	id,
	session,
}: {
	id: string;
	session?: ClientSession;
}): Promise<void> {
	try {
		await BuyerOrder.deleteOne(
			{ _id: new mongoose.Types.ObjectId(id) },
			{ session },
		);
	} catch {
		// best effort
	}
}

export async function getBuyerOrderByIdDB({
	id,
	session,
}: {
	id: string;
	session?: ClientSession;
}): Promise<IBuyerOrder | null> {
	try {
		if (!mongoose.Types.ObjectId.isValid(id)) return null;
		return (
			(
				await BuyerOrder.aggregate<IBuyerOrder>(
					[
						{ $match: { _id: new mongoose.Types.ObjectId(id) } },
						{ $limit: 1 },
					],
					{ session },
				)
			).at(0) ?? null
		);
	} catch {
		return null;
	}
}

export async function getBuyerOrderByNumberDB({
	orderNumber,
	session,
}: {
	orderNumber: string;
	session?: ClientSession;
}): Promise<IBuyerOrder | null> {
	try {
		return (
			(
				await BuyerOrder.aggregate<IBuyerOrder>(
					[{ $match: { orderNumber } }, { $limit: 1 }],
					{ session },
				)
			).at(0) ?? null
		);
	} catch {
		return null;
	}
}

export async function getBuyerOrderByReceiptUrlDB({
	receiptUrl,
	session,
}: {
	receiptUrl: string;
	session?: ClientSession;
}): Promise<IBuyerOrder | null> {
	try {
		return (
			(
				await BuyerOrder.aggregate<IBuyerOrder>(
					[{ $match: { receiptUrl } }, { $limit: 1 }],
					{ session },
				)
			).at(0) ?? null
		);
	} catch {
		return null;
	}
}

export async function listBuyerOrdersByBuyerDB({
	buyerId,
	limit = MAX_LIMIT,
	offset = 0,
	session,
}: {
	buyerId: string;
	limit?: number;
	offset?: number;
	session?: ClientSession;
}): Promise<IBuyerOrder[]> {
	try {
		if (!mongoose.Types.ObjectId.isValid(buyerId)) return [];
		return await BuyerOrder.aggregate<IBuyerOrder>(
			[
				{ $match: { buyerId: new mongoose.Types.ObjectId(buyerId) } },
				{ $sort: { createdAt: -1 } },
				{ $skip: offset },
				{ $limit: Math.min(limit, MAX_LIMIT) },
			],
			{ session },
		);
	} catch {
		return [];
	}
}

/**
 * Per-buyer order analytics: total orders, a status breakdown, and lifetime
 * spend (sum of totalKobo over PAID and beyond). Powers the admin user view.
 */
export async function aggregateBuyerOrderStatsDB({
	buyerId,
}: {
	buyerId: string;
}): Promise<{
	total: number;
	byStatus: Record<string, number>;
	totalSpentKobo: number;
}> {
	const empty = { total: 0, byStatus: {}, totalSpentKobo: 0 };
	try {
		if (!mongoose.Types.ObjectId.isValid(buyerId)) return empty;
		const spentStatuses = [
			OrderStatus.PAID,
			OrderStatus.CONFIRMED,
			OrderStatus.PREPARING,
			OrderStatus.READY,
			OrderStatus.COMPLETED,
		];
		const rows = await BuyerOrder.aggregate<{
			_id: string;
			count: number;
			spent: number;
		}>([
			{ $match: { buyerId: new mongoose.Types.ObjectId(buyerId) } },
			{
				$group: {
					_id: "$status",
					count: { $sum: 1 },
					spent: {
						$sum: {
							$cond: [
								{ $in: ["$status", spentStatuses] },
								"$totalKobo",
								0,
							],
						},
					},
				},
			},
		]);
		const byStatus: Record<string, number> = {};
		let total = 0;
		let totalSpentKobo = 0;
		for (const r of rows) {
			byStatus[r._id] = r.count;
			total += r.count;
			totalSpentKobo += r.spent;
		}
		return { total, byStatus, totalSpentKobo };
	} catch {
		return empty;
	}
}

export async function listBuyerOrdersByVendorAndDailyOrderDB({
	vendorId,
	dailyOrderId,
	session,
}: {
	vendorId: string;
	dailyOrderId: string;
	session?: ClientSession;
}): Promise<IBuyerOrder[]> {
	try {
		return await BuyerOrder.aggregate<IBuyerOrder>(
			[
				{
					$match: {
						vendorId: new mongoose.Types.ObjectId(vendorId),
						dailyOrderId: new mongoose.Types.ObjectId(dailyOrderId),
						status: {
							$in: [
								OrderStatus.PAID,
								OrderStatus.CONFIRMED,
								OrderStatus.PREPARING,
								OrderStatus.READY,
								OrderStatus.COMPLETED,
							],
						},
					},
				},
				{ $sort: { createdAt: 1 } },
			],
			{ session },
		);
	} catch {
		return [];
	}
}

export async function setBuyerOrderStatusDB({
	id,
	status,
	fromStatuses,
	session,
}: {
	id: string;
	status: OrderStatus;
	fromStatuses?: OrderStatus[];
	session?: ClientSession;
}): Promise<IBuyerOrder | null> {
	try {
		const filter: Record<string, unknown> = {
			_id: new mongoose.Types.ObjectId(id),
		};
		if (fromStatuses?.length) filter.status = { $in: fromStatuses };
		const res = await BuyerOrder.findOneAndUpdate(
			filter,
			{ $set: { status } },
			{ session, returnDocument: "after" },
		);
		return res ? (res.toObject() as unknown as IBuyerOrder) : null;
	} catch {
		return null;
	}
}

export async function markBuyerOrderPaidDB({
	id,
	channel,
	session,
}: {
	id: string;
	channel?: string;
	session?: ClientSession;
}): Promise<IBuyerOrder | null> {
	try {
		const res = await BuyerOrder.findOneAndUpdate(
			{
				_id: new mongoose.Types.ObjectId(id),
				status: {
					$in: [
						OrderStatus.PENDING_PAYMENT,
						OrderStatus.AWAITING_EXTERNAL_PAYMENT,
					],
				},
			},
			{ $set: { status: OrderStatus.PAID, paidAt: new Date(), channel } },
			{ session, returnDocument: "after" },
		);
		return res ? (res.toObject() as unknown as IBuyerOrder) : null;
	} catch {
		return null;
	}
}

export async function markBuyerOrderPendingPaymentDB({
	id,
	session,
}: {
	id: string;
	session?: ClientSession;
}): Promise<IBuyerOrder | null> {
	try {
		const res = await BuyerOrder.findOneAndUpdate(
			{
				_id: new mongoose.Types.ObjectId(id),
				status: OrderStatus.AWAITING_EXTERNAL_PAYMENT,
			},
			{ $set: { status: OrderStatus.PENDING_PAYMENT } },
			{ session, returnDocument: "after" },
		);
		return res ? (res.toObject() as unknown as IBuyerOrder) : null;
	} catch {
		return null;
	}
}

export async function markBuyerOrderCancelledDB({
	id,
	reason,
	cancelledBy,
	fromStatuses,
	session,
}: {
	id: string;
	reason: string;
	cancelledBy: "buyer" | "vendor" | "system";
	fromStatuses?: OrderStatus[];
	session?: ClientSession;
}): Promise<IBuyerOrder | null> {
	try {
		const filter: Record<string, unknown> = {
			_id: new mongoose.Types.ObjectId(id),
		};
		if (fromStatuses?.length) filter.status = { $in: fromStatuses };
		const res = await BuyerOrder.findOneAndUpdate(
			filter,
			{
				$set: {
					status: OrderStatus.CANCELLED,
					cancellationReason: reason,
					cancelledBy,
				},
			},
			{ session, returnDocument: "after" },
		);
		return res ? (res.toObject() as unknown as IBuyerOrder) : null;
	} catch {
		return null;
	}
}

export async function markBuyerOrderRefundedDB({
	id,
	session,
}: {
	id: string;
	session?: ClientSession;
}): Promise<boolean> {
	try {
		const res = await BuyerOrder.findByIdAndUpdate(
			new mongoose.Types.ObjectId(id),
			{ $set: { status: OrderStatus.REFUNDED } },
			{ session, returnDocument: "after" },
		);
		return !!res;
	} catch {
		return false;
	}
}

export async function setBuyerOrderReceiptUrlDB({
	id,
	receiptUrl,
	session,
}: {
	id: string;
	receiptUrl: string;
	session?: ClientSession;
}): Promise<boolean> {
	try {
		const res = await BuyerOrder.findByIdAndUpdate(
			new mongoose.Types.ObjectId(id),
			{ $set: { receiptUrl } },
			{ session, returnDocument: "after" },
		);
		return !!res;
	} catch {
		return false;
	}
}

/**
 * Receipt-generation lifecycle write (PRD §8.13).
 *
 * Unconditional by id: eligibility is the service layer's call
 * (`isReceiptEligible`), and this must stay writable for the FAILED transition
 * of an order that stopped being eligible mid-render — otherwise a status-gated
 * write here would strand that order on PENDING, which is exactly what the
 * schema comment above warns against.
 */
export async function setBuyerOrderReceiptStatusDB({
	id,
	receiptStatus,
	session,
}: {
	id: string;
	receiptStatus: ReceiptStatus;
	session?: ClientSession;
}): Promise<boolean> {
	try {
		const res = await BuyerOrder.findByIdAndUpdate(
			new mongoose.Types.ObjectId(id),
			{ $set: { receiptStatus } },
			{ session, returnDocument: "after" },
		);
		return !!res;
	} catch {
		return false;
	}
}

/** Cron sweep: orders stuck in PENDING_PAYMENT beyond the abandon threshold. */
export async function findAbandonedBuyerOrderIdsDB({
	olderThanMinutes,
	limit = 200,
}: {
	olderThanMinutes: number;
	limit?: number;
}): Promise<string[]> {
	try {
		const threshold = new Date(Date.now() - olderThanMinutes * 60 * 1000);
		const rows = await BuyerOrder.find(
			{
				status: OrderStatus.PENDING_PAYMENT,
				createdAt: { $lt: threshold },
			},
			{ _id: 1 },
		)
			.limit(limit)
			.lean();
		return rows.map((r) => r._id.toString());
	} catch {
		return [];
	}
}

export async function countBuyerOrdersDB({
	filter,
}: {
	filter?: Record<string, unknown>;
} = {}): Promise<number> {
	try {
		return await BuyerOrder.countDocuments(filter ?? {});
	} catch {
		return 0;
	}
}

/** Admin: list orders across the platform, newest first, with optional filter. */
export async function listBuyerOrdersDB({
	filter,
	limit = MAX_LIMIT,
	offset = 0,
	session,
}: {
	filter?: Record<string, unknown>;
	limit?: number;
	offset?: number;
	session?: ClientSession;
}): Promise<IBuyerOrder[]> {
	try {
		return await BuyerOrder.aggregate<IBuyerOrder>(
			[
				{ $match: filter ?? {} },
				{ $sort: { createdAt: -1 } },
				{ $skip: offset },
				{ $limit: Math.min(limit, MAX_LIMIT) },
			],
			{ session },
		);
	} catch {
		return [];
	}
}

export interface IVendorDailyStat {
	vendorId: string;
	totalOrders: number;
	completedOrders: number;
	cancelledOrders: number;
	totalRevenueKobo: number;
	/** Up to 5 menuItemIds, most-ordered first, by units sold that day. */
	topItemIds: string[];
	/** Hour 0–23 in PLATFORM_TIMEZONE with the most orders; undefined if none. */
	peakHour?: number;
}

/**
 * Group orders in a date window by vendor for the daily analytics snapshot.
 *
 * `from`/`to` is half-open `[from, to)` and is expected to be a *Lagos*
 * calendar day (see `previousDayWindowInTimezone`). Revenue, top items and
 * peak hour all count only `SETTLED_ORDER_STATUSES`; `totalOrders` counts
 * every order created in the window regardless of status.
 */
export async function aggregateVendorDailyStatsDB({
	from,
	to,
	timeZone = PLATFORM_TIMEZONE,
}: {
	from: Date;
	to: Date;
	timeZone?: string;
}): Promise<IVendorDailyStat[]> {
	try {
		const [facets] = await BuyerOrder.aggregate<{
			totals: {
				_id: mongoose.Types.ObjectId;
				totalOrders: number;
				completedOrders: number;
				cancelledOrders: number;
				totalRevenueKobo: number;
			}[];
			topItems: { _id: mongoose.Types.ObjectId; topItemIds: string[] }[];
			peak: { _id: mongoose.Types.ObjectId; peakHour: number }[];
		}>([
			{ $match: { createdAt: { $gte: from, $lt: to } } },
			{
				$facet: {
					totals: [
						{
							$group: {
								_id: "$vendorId",
								totalOrders: { $sum: 1 },
								completedOrders: {
									$sum: {
										$cond: [
											{
												$eq: [
													"$status",
													OrderStatus.COMPLETED,
												],
											},
											1,
											0,
										],
									},
								},
								cancelledOrders: {
									$sum: {
										$cond: [
											{
												$in: [
													"$status",
													[
														OrderStatus.CANCELLED,
														OrderStatus.REFUNDED,
													],
												],
											},
											1,
											0,
										],
									},
								},
								// Vendor-facing revenue is the vendor's settlement,
								// NOT what the buyer paid: totalKobo bakes in the
								// buyer platform fee and delivery. Older rows
								// predate vendorSettlementKobo, hence the fallback.
								totalRevenueKobo: {
									$sum: {
										$cond: [
											{
												$in: [
													"$status",
													SETTLED_ORDER_STATUSES,
												],
											},
											{
												$ifNull: [
													"$vendorSettlementKobo",
													"$totalKobo",
												],
											},
											0,
										],
									},
								},
							},
						},
					],
					// Top 5 items by units sold. menuItemId is optional on the
					// embedded line, so null-keyed lines are dropped rather
					// than collapsing into a bogus "null" top item.
					topItems: [
						{ $match: { status: { $in: SETTLED_ORDER_STATUSES } } },
						{ $unwind: "$items" },
						{ $match: { "items.menuItemId": { $ne: null } } },
						{
							$group: {
								_id: {
									vendorId: "$vendorId",
									menuItemId: "$items.menuItemId",
								},
								quantity: { $sum: "$items.quantity" },
							},
						},
						// menuItemId in the sort key makes ties deterministic.
						{
							$sort: {
								"_id.vendorId": 1,
								quantity: -1,
								"_id.menuItemId": 1,
							},
						},
						{
							$group: {
								_id: "$_id.vendorId",
								ranked: { $push: "$_id.menuItemId" },
							},
						},
						{
							$project: {
								topItemIds: {
									$map: {
										input: { $slice: ["$ranked", 5] },
										as: "m",
										in: { $toString: "$$m" },
									},
								},
							},
						},
					],
					// Busiest ordering hour, bucketed in Lagos wall-clock time.
					// Ties resolve to the earlier hour.
					peak: [
						{ $match: { status: { $in: SETTLED_ORDER_STATUSES } } },
						{
							$group: {
								_id: {
									vendorId: "$vendorId",
									hour: {
										$hour: {
											date: "$createdAt",
											timezone: timeZone,
										},
									},
								},
								orders: { $sum: 1 },
							},
						},
						{
							$sort: {
								"_id.vendorId": 1,
								orders: -1,
								"_id.hour": 1,
							},
						},
						{
							$group: {
								_id: "$_id.vendorId",
								peakHour: { $first: "$_id.hour" },
							},
						},
					],
				},
			},
		]);
		if (!facets) return [];
		const topByVendor = new Map(
			facets.topItems.map((t) => [t._id.toString(), t.topItemIds]),
		);
		const peakByVendor = new Map(
			facets.peak.map((p) => [p._id.toString(), p.peakHour]),
		);
		return facets.totals.map((r) => {
			const vendorId = r._id.toString();
			return {
				vendorId,
				totalOrders: r.totalOrders,
				completedOrders: r.completedOrders,
				cancelledOrders: r.cancelledOrders,
				totalRevenueKobo: r.totalRevenueKobo,
				topItemIds: topByVendor.get(vendorId) ?? [],
				peakHour: peakByVendor.get(vendorId),
			};
		});
	} catch {
		return [];
	}
}

export interface IVendorLifetimeStat {
	vendorId: string;
	/** Orders that reached at least PAID and were not cancelled/refunded. */
	settledOrders: number;
	completedOrders: number;
	/** completedOrders / settledOrders as a percentage, 0–100, 2dp. */
	completionRate: number;
}

/**
 * Lifetime completion stats for every vendor, in a single pass over the
 * collection. Recomputed nightly rather than incremented per order because an
 * order created days ago can still transition to COMPLETED today — a
 * window-scoped recompute would silently freeze those vendors' rates.
 *
 * completionRate = COMPLETED / SETTLED_ORDER_STATUSES * 100. A vendor with no
 * settled orders yet is reported as 0 (not NaN), matching the field default.
 */
export async function aggregateVendorLifetimeStatsDB(): Promise<
	IVendorLifetimeStat[]
> {
	try {
		const rows = await BuyerOrder.aggregate<{
			_id: mongoose.Types.ObjectId;
			settledOrders: number;
			completedOrders: number;
		}>([
			{ $match: { status: { $in: SETTLED_ORDER_STATUSES } } },
			{
				$group: {
					_id: "$vendorId",
					settledOrders: { $sum: 1 },
					completedOrders: {
						$sum: {
							$cond: [
								{ $eq: ["$status", OrderStatus.COMPLETED] },
								1,
								0,
							],
						},
					},
				},
			},
		]);
		return rows.map((r) => ({
			vendorId: r._id.toString(),
			settledOrders: r.settledOrders,
			completedOrders: r.completedOrders,
			completionRate:
				r.settledOrders > 0
					? Math.round(
							(r.completedOrders / r.settledOrders) * 100 * 100,
						) / 100
					: 0,
		}));
	} catch {
		return [];
	}
}

export interface IStalePaidOrder {
	id: string;
	vendorId: string;
	buyerId: string;
	dailyOrderId: string;
	totalKobo: number;
	cutoffTime: Date;
}

/**
 * Cron sweep: orders still sitting in PAID after their listing's `cutoffTime`
 * has passed — the vendor took the money but never confirmed. These are the
 * refund candidates.
 *
 * Driven from the buyerOrders side on purpose: PAID is a small transient
 * working set, whereas "listings past cutoff" grows without bound as history
 * accumulates, so starting from dailyOrders would build an ever-growing `$in`.
 * Supported by the `status_1_dailyOrderId_1` index.
 */
export async function findStalePaidOrdersPastCutoffDB({
	now = new Date(),
	limit = 200,
}: {
	now?: Date;
	limit?: number;
} = {}): Promise<IStalePaidOrder[]> {
	try {
		const rows = await BuyerOrder.aggregate<{
			_id: mongoose.Types.ObjectId;
			vendorId: mongoose.Types.ObjectId;
			buyerId: mongoose.Types.ObjectId;
			dailyOrderId: mongoose.Types.ObjectId;
			totalKobo: number;
			cutoffTime: Date;
		}>([
			{ $match: { status: OrderStatus.PAID } },
			{
				$lookup: {
					from: "dailyorders",
					localField: "dailyOrderId",
					foreignField: "_id",
					as: "listing",
					pipeline: [
						{ $match: { cutoffTime: { $lte: now } } },
						{ $project: { cutoffTime: 1 } },
					],
				},
			},
			{ $unwind: "$listing" },
			{ $sort: { "listing.cutoffTime": 1 } },
			{ $limit: limit },
			{
				$project: {
					vendorId: 1,
					buyerId: 1,
					dailyOrderId: 1,
					totalKobo: 1,
					cutoffTime: "$listing.cutoffTime",
				},
			},
		]);
		return rows.map((r) => ({
			id: r._id.toString(),
			vendorId: r.vendorId.toString(),
			buyerId: r.buyerId.toString(),
			dailyOrderId: r.dailyOrderId.toString(),
			totalKobo: r.totalKobo,
			cutoffTime: r.cutoffTime,
		}));
	} catch {
		return [];
	}
}

export async function findExpiredExternalPaymentOrderIdsDB({
	olderThanMinutes,
	limit = 200,
}: {
	olderThanMinutes: number;
	limit?: number;
}): Promise<string[]> {
	try {
		const threshold = new Date(Date.now() - olderThanMinutes * 60 * 1000);
		const rows = await BuyerOrder.find(
			{
				status: OrderStatus.AWAITING_EXTERNAL_PAYMENT,
				createdAt: { $lt: threshold },
			},
			{ _id: 1 },
		)
			.limit(limit)
			.lean();
		return rows.map((r) => r._id.toString());
	} catch {
		return [];
	}
}

export interface IVendorEarningsDay {
	date: Date;
	totalOrders: number;
	completedOrders: number;
	cancelledOrders: number;
	totalRevenueKobo: number;
	totalFoodSubtotalKobo: number;
	totalCommissionKobo: number;
	totalDeliveryEarningsKobo: number;
	totalVendorSettlementKobo: number;
	avgOrderValueKobo: number;
}

export interface IVendorEarningsStats {
	days: IVendorEarningsDay[];
	totalOrders: number;
	completedOrders: number;
	cancelledOrders: number;
	totalRevenueKobo: number;
	totalFoodSubtotalKobo: number;
	totalCommissionKobo: number;
	totalDeliveryEarningsKobo: number;
	totalVendorSettlementKobo: number;
	avgOrderValueKobo: number;
	completionRate: number;
}

export async function aggregateVendorEarningsStatsDB({
	vendorId,
}: {
	vendorId: string;
}): Promise<IVendorEarningsStats> {
	const empty: IVendorEarningsStats = {
		days: [],
		totalOrders: 0,
		completedOrders: 0,
		cancelledOrders: 0,
		totalRevenueKobo: 0,
		totalFoodSubtotalKobo: 0,
		totalCommissionKobo: 0,
		totalDeliveryEarningsKobo: 0,
		totalVendorSettlementKobo: 0,
		avgOrderValueKobo: 0,
		completionRate: 0,
	};
	try {
		if (!mongoose.Types.ObjectId.isValid(vendorId)) return empty;
		const completedExpr = {
			$and: [
				{ $eq: ["$status", OrderStatus.COMPLETED] },
				{ $ne: ["$paidAt", null] },
			],
		};
		const cancelledExpr = {
			$in: ["$status", [OrderStatus.CANCELLED, OrderStatus.REFUNDED]],
		};
		const rows = await BuyerOrder.aggregate<{
			_id: string;
			totalOrders: number;
			completedOrders: number;
			cancelledOrders: number;
			totalRevenueKobo: number;
			totalFoodSubtotalKobo: number;
			totalCommissionKobo: number;
			totalDeliveryEarningsKobo: number;
			totalVendorSettlementKobo: number;
		}>([
			{ $match: { vendorId: new mongoose.Types.ObjectId(vendorId) } },
			{
				$group: {
					_id: {
						$dateToString: {
							format: "%Y-%m-%d",
							date: "$createdAt",
						},
					},
					totalOrders: {
						$sum: {
							$cond: [
								{ $or: [completedExpr, cancelledExpr] },
								1,
								0,
							],
						},
					},
					completedOrders: {
						$sum: { $cond: [completedExpr, 1, 0] },
					},
					cancelledOrders: {
						$sum: { $cond: [cancelledExpr, 1, 0] },
					},
					totalRevenueKobo: {
						$sum: {
							$cond: [
								completedExpr,
								{
									$ifNull: [
										"$vendorSettlementKobo",
										"$totalKobo",
									],
								},
								0,
							],
						},
					},
					totalFoodSubtotalKobo: {
						$sum: {
							$cond: [completedExpr, "$subtotalKobo", 0],
						},
					},
					totalCommissionKobo: {
						$sum: {
							$cond: [
								completedExpr,
								{ $ifNull: ["$prechopCommissionKobo", 0] },
								0,
							],
						},
					},
					totalDeliveryEarningsKobo: {
						$sum: {
							$cond: [completedExpr, "$deliveryFeeKobo", 0],
						},
					},
					totalVendorSettlementKobo: {
						$sum: {
							$cond: [
								completedExpr,
								{
									$ifNull: [
										"$vendorSettlementKobo",
										"$totalKobo",
									],
								},
								0,
							],
						},
					},
				},
			},
			{ $sort: { _id: 1 } },
		]);

		let totalOrders = 0;
		let completedOrders = 0;
		let cancelledOrders = 0;
		let totalRevenueKobo = 0;
		let totalFoodSubtotalKobo = 0;
		let totalCommissionKobo = 0;
		let totalDeliveryEarningsKobo = 0;
		let totalVendorSettlementKobo = 0;
		const days = rows.map((row) => {
			totalOrders += row.totalOrders;
			completedOrders += row.completedOrders;
			cancelledOrders += row.cancelledOrders;
			totalRevenueKobo += row.totalRevenueKobo;
			totalFoodSubtotalKobo += row.totalFoodSubtotalKobo;
			totalCommissionKobo += row.totalCommissionKobo;
			totalDeliveryEarningsKobo += row.totalDeliveryEarningsKobo;
			totalVendorSettlementKobo += row.totalVendorSettlementKobo;
			return {
				date: new Date(`${row._id}T00:00:00.000Z`),
				totalOrders: row.totalOrders,
				completedOrders: row.completedOrders,
				cancelledOrders: row.cancelledOrders,
				totalRevenueKobo: row.totalRevenueKobo,
				totalFoodSubtotalKobo: row.totalFoodSubtotalKobo,
				totalCommissionKobo: row.totalCommissionKobo,
				totalDeliveryEarningsKobo: row.totalDeliveryEarningsKobo,
				totalVendorSettlementKobo: row.totalVendorSettlementKobo,
				avgOrderValueKobo:
					row.completedOrders > 0
						? Math.round(row.totalRevenueKobo / row.completedOrders)
						: 0,
			};
		});
		const resolvedOrders = completedOrders + cancelledOrders;
		return {
			days,
			totalOrders,
			completedOrders,
			cancelledOrders,
			totalRevenueKobo,
			totalFoodSubtotalKobo,
			totalCommissionKobo,
			totalDeliveryEarningsKobo,
			totalVendorSettlementKobo,
			avgOrderValueKobo:
				completedOrders > 0
					? Math.round(totalRevenueKobo / completedOrders)
					: 0,
			completionRate:
				resolvedOrders > 0
					? (completedOrders / resolvedOrders) * 100
					: 0,
		};
	} catch {
		return empty;
	}
}

export * from "./types";
