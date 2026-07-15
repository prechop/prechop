import mongoose from "mongoose";
import { Payment, PaymentStatus } from "../../models";
import { PLATFORM_TIMEZONE, startOfDayInTimezone } from "../../models/utils";
import { getEffectiveFeePolicy } from "../siteConfigs";
import { resolveVendorByUserId, vendorIdOf } from "../vendors/resolveVendor";

export type EarningsRange = "today" | "week" | "month" | "all";

export interface VendorEarningsDay {
	/** Lagos calendar day, `YYYY-MM-DD`. */
	date: string;
	orders: number;
	grossKobo: number;
	platformFeeKobo: number;
	netSettledKobo: number;
}

export interface VendorEarnings {
	/** Paystack can only split to a vendor who has connected a subaccount. */
	bankConnected: boolean;
	/**
	 * The commission rate `placeOrder` will actually charge on the vendor's next
	 * order, percent of food subtotal (e.g. 8 = 8%). Resolved from siteConfigs
	 * through the same guard the charge uses — see `resolvePlatformFeePolicy`.
	 */
	platformFeeVendorPercent: number;
	totals: {
		grossKobo: number;
		platformFeeKobo: number;
		netSettledKobo: number;
		orders: number;
	};
	days: VendorEarningsDay[];
}

/**
 * Lower bound of `range` as a UTC instant, resolved on the **Lagos** calendar —
 * "today" must mean today in Lagos, not on whatever host the app runs on, or a
 * vendor checking their phone at 00:30 Lagos sees yesterday's money.
 * `null` means unbounded ("all").
 */
function rangeStart(range: EarningsRange, now: Date): Date | null {
	if (range === "all") return null;
	const startOfToday = startOfDayInTimezone(now);
	if (range === "today") return startOfToday;
	// Inclusive of today: "week" is the last 7 Lagos days, "month" the last 30.
	const days = range === "week" ? 6 : 29;
	return startOfDayInTimezone(
		new Date(startOfToday.getTime() - days * 24 * 60 * 60 * 1000),
	);
}

/**
 * Vendor earnings, derived from `Payment` rows with `status: SUCCESS`.
 *
 * **Why Payments and not AnalyticsSnapshot:** snapshots carry a single
 * `totalRevenueKobo` with no fee split, so every read of them overstates what a
 * vendor actually receives. The split (`prechopCommissionKobo`,
 * `vendorSettlementKobo`) is computed once at order placement and persisted on
 * the Payment; that row is the only record of what Paystack was actually told to
 * settle. Snapshots are also rebuilt nightly, so today's money is missing from
 * them entirely.
 *
 * **Field-name trap:** `Payment.platformFeeKobo` is the *vendor* commission
 * (placeOrder writes `platformFeeKobo: prechopCommissionKobo`), whereas
 * `BuyerOrder.platformFeeKobo` is the *buyer's* processing fee. Same name, two
 * collections, two different pockets. This reads the Payment sense, and prefers
 * the unambiguous `prechopCommissionKobo` where present.
 *
 * **No pending balance / settlement date, by design:** Paystack subaccount
 * splits settle the vendor directly. PreChop never holds the money, so there is
 * no float to report a "pending balance" against and no settlement date PreChop
 * is entitled to state. Both would be fiction.
 */
export async function getVendorEarnings({
	userId,
	range = "today",
	now = new Date(),
}: {
	userId: string;
	range?: EarningsRange;
	now?: Date;
}): Promise<VendorEarnings> {
	// Authorization: a vendor may only ever read their *own* earnings. The
	// vendor is resolved from the authenticated user, never from a caller-
	// supplied vendorId — there is deliberately no way to ask for someone
	// else's money.
	const vendor = await resolveVendorByUserId({ userId });
	const vendorId = vendorIdOf(vendor);

	const from = rangeStart(range, now);
	const match: Record<string, unknown> = {
		vendorId: new mongoose.Types.ObjectId(vendorId),
		status: PaymentStatus.SUCCESS,
	};
	// Bucket on when the money actually landed, not when the row was created —
	// an order placed at 23:58 and paid at 00:02 belongs to the new day.
	const paidAtExpr = { $ifNull: ["$paidAt", "$createdAt"] };
	if (from) match.$expr = { $gte: [paidAtExpr, from] };

	const rows = await Payment.aggregate<{
		_id: string;
		orders: number;
		grossKobo: number;
		platformFeeKobo: number;
		netSettledKobo: number;
	}>([
		{ $match: match },
		{
			$group: {
				_id: {
					$dateToString: {
						format: "%Y-%m-%d",
						date: paidAtExpr,
						timezone: PLATFORM_TIMEZONE,
					},
				},
				orders: { $sum: 1 },
				// The vendor's gross is the food they sold plus any delivery
				// they carry — NOT `amountKobo`, which also contains the
				// buyer's service fee, money that was never the vendor's.
				grossKobo: {
					$sum: {
						$add: [
							{ $ifNull: ["$foodSubtotalKobo", 0] },
							{ $ifNull: ["$deliveryFeeKobo", 0] },
						],
					},
				},
				platformFeeKobo: {
					$sum: {
						$ifNull: [
							"$prechopCommissionKobo",
							"$platformFeeKobo",
							0,
						],
					},
				},
				// Already computed at placement and handed to Paystack as the
				// split — never recomputed here, so the number a vendor sees is
				// the number that was actually settled.
				netSettledKobo: {
					$sum: {
						$ifNull: [
							"$vendorSettlementKobo",
							"$vendorAmountKobo",
							0,
						],
					},
				},
			},
		},
		{ $sort: { _id: 1 } },
	]);

	const days: VendorEarningsDay[] = rows.map((r) => ({
		date: r._id,
		orders: r.orders,
		grossKobo: r.grossKobo,
		platformFeeKobo: r.platformFeeKobo,
		netSettledKobo: r.netSettledKobo,
	}));

	const totals = days.reduce(
		(acc, d) => ({
			grossKobo: acc.grossKobo + d.grossKobo,
			platformFeeKobo: acc.platformFeeKobo + d.platformFeeKobo,
			netSettledKobo: acc.netSettledKobo + d.netSettledKobo,
			orders: acc.orders + d.orders,
		}),
		{ grossKobo: 0, platformFeeKobo: 0, netSettledKobo: 0, orders: 0 },
	);

	const fees = await resolvePlatformFeePolicy();

	return {
		bankConnected: vendor.paystackSubaccountCode != null,
		platformFeeVendorPercent: fees.platformFeeVendorPercent,
		totals,
		days,
	};
}

/**
 * The vendor-side fee policy to *display*.
 *
 * The percentage model is the real one: `placeOrder` charges
 * `calculateVendorCommissionKobo(subtotal, resolveFeePolicy(siteConfigs))`, a
 * percent of the food subtotal. The flat `platformFeeVendorKobo` field is
 * retired — it is no longer returned, because it always resolved to 0 and the
 * earnings page rendered that as "₦0.00 per order" to every vendor.
 *
 * This delegates to `getEffectiveFeePolicy`, which reads the same siteConfigs
 * doc through the same `resolveFeePolicy` guard as the charge. Reading the env
 * constant `PRECHOP_VENDOR_COMMISSION_PERCENT` here instead — as this used to —
 * meant an admin setting 12% was charged 12% and reported 8%. The env constant
 * is only the fallback `resolveFeePolicy` lands on when the config is unset or
 * invalid; it is not the policy.
 *
 * Note this is the rate applied to the vendor's *next* order, not a rate derived
 * from the historical rows above. `totals.platformFeeKobo` is the sum of what
 * was actually charged at each order's placement time, under whatever policy was
 * live then; a rate change does not retroactively restate it. The two are
 * consistent only while the policy has not moved within the range — which is
 * correct, and why the rate is labelled as a policy, not as a computed average.
 */
async function resolvePlatformFeePolicy(): Promise<{
	platformFeeVendorPercent: number;
}> {
	const { platformFeeVendorPercent } = await getEffectiveFeePolicy();
	return { platformFeeVendorPercent };
}
