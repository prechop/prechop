import { handleError, ok, withApiHandler } from "@/server/lib";
import {
	getSiteConfigs,
	toEffectiveFeePolicy,
} from "@/server/services/siteConfigs";

export const runtime = "nodejs";

/**
 * Public, unauthenticated marketplace policy.
 *
 * **Why the fee policy ships on this route and not an authed one:** checkout is
 * pre-auth — a buyer sees the service-fee line on the order page before they
 * have an account — so the only surface that can quote them honestly is one that
 * needs no session. Every buyer-facing wrapper already polls this route for
 * `marketplaceEnabled`, so the policy rides along on a request that was being
 * made anyway.
 *
 * **Why not env:** the fee constants have no `NEXT_PUBLIC_` prefix and must not
 * get one. Prefixing bakes the value in at build time, which would still ignore
 * the admin's siteConfigs — a quote that looks correct and drifts the moment an
 * admin touches the rate. The value below is resolved server-side, per request,
 * through the same `resolveFeePolicy` guard `placeOrder` charges with.
 *
 * Nothing secret is exposed: these are the rates a buyer is about to be charged
 * and is entitled to see before paying.
 */
export const GET = withApiHandler(
	{ route: "/api/site-configs/marketplace" },
	async () => {
		try {
			const configs = await getSiteConfigs();
			return ok({
				marketplaceEnabled: configs.marketplaceEnabled,
				scheduleAheadEnabled: configs.scheduleAheadEnabled,
				weeklyBreakfastPlanEnabled: configs.weeklyBreakfastPlanEnabled,
				breakfastEnabled: configs.breakfastEnabled,
				lunchEnabled: configs.lunchEnabled,
				dinnerEnabled: configs.dinnerEnabled,
				deliveryEnabled: configs.deliveryEnabled,
				pickupEnabled: configs.pickupEnabled,
				vendorRegistrationEnabled: configs.vendorRegistrationEnabled,
				...toEffectiveFeePolicy(configs),
			});
		} catch (error) {
			return handleError(error);
		}
	},
);
