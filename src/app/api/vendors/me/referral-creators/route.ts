import { withApiHandler, withAuth } from "@/server/lib";
import { assertActiveVendor, handleError, ok } from "@/server/lib";
import mongoose from "mongoose";
import {
	listReferralsByVendorDB,
} from "@/server/models/referrals";
import { ReferralReward } from "@/server/models/referralRewards";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/vendors/me/referral-creators" },
	withAuth(async ({ auth }) => {
		try {
			const vendor = await assertActiveVendor(auth);
			const vendorId = vendor._id.toString();

			const referrals = await listReferralsByVendorDB({
				vendorId,
				limit: 200,
			});

			const creatorMap = new Map<string, { creatorUserId: string; count: number }>();
			for (const r of referrals) {
				const cid = r.creatorUserId;
				const existing = creatorMap.get(cid);
				if (existing) {
					existing.count += 1;
				} else {
					creatorMap.set(cid, { creatorUserId: cid, count: 1 });
				}
			}

			const creators = Array.from(creatorMap.values()).sort(
				(a, b) => b.count - a.count,
			);

			const enriched = await Promise.all(
				creators.map(async (c) => {
					const rewards = await ReferralReward.countDocuments({
						vendorId: new mongoose.Types.ObjectId(vendorId),
						creatorUserId: new mongoose.Types.ObjectId(c.creatorUserId),
					});
					const redeemed = await ReferralReward.countDocuments({
						vendorId: new mongoose.Types.ObjectId(vendorId),
						creatorUserId: new mongoose.Types.ObjectId(c.creatorUserId),
						redeemedAt: { $ne: null },
					});
					return {
						creatorUserId: c.creatorUserId,
						count: c.count,
						rewardsUnlocked: rewards,
						rewardsRedeemed: redeemed,
					};
				}),
			);

			return ok(enriched);
		} catch (e) {
			return handleError(e);
		}
	}),
);
