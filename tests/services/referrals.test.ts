import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	createReferralCampaignDB,
	createReferralLinkDB,
	createReferralRewardDB,
	getReferralLinkByCreatorDB,
	getReferralLinkByTokenDB,
} from "@/server/models/referralCampaigns";
import {
	createReferralAuditLogDB,
	createReferralDB,
	findDeviceCollisionDB,
	findIpCollisionDB,
	hasReferredUserInCampaignDB,
	listReferralsByVendorDB,
	Referral,
} from "@/server/models/referrals";
import {
	countRedeemedRewardsByCreatorDB,
	redeemReferralRewardDB,
} from "@/server/models/referralRewards";
import {
	ReferralCampaign,
} from "@/server/models/referralCampaigns";
import { getOrCreateLink, resolveLinkByToken } from "@/server/services/referrals/links";
import {
	getActiveCampaign,
	getOrCreateCampaign,
	updateCampaignSettings,
	endCampaign,
} from "@/server/services/referrals/campaign";
import {
	creditReferralIfEligible,
	type CreditReferralResult,
} from "@/server/services/referrals/credit";
import { checkDeviceCollision, checkIpCollision, hashIp } from "@/server/services/referrals/fraud";
import { connectTestDB, dropAndDisconnect, oid } from "../helpers/db";

beforeAll(async () => {
	await connectTestDB();
});

afterAll(async () => {
	await dropAndDisconnect();
});

describe("referralCampaigns model", () => {
	const vendorId = oid();

	it("creates and retrieves a campaign", async () => {
		const created = await createReferralCampaignDB({
			payload: {
				vendorId,
				isActive: true,
				startDate: new Date(),
				endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
				threshold: 10,
				rewardExpiryDays: 30,
				rewardType: "FREE_MEAL",
			},
		});
		expect(created).not.toBeNull();
		expect(created!.vendorId.toString()).toBe(vendorId);

		const fetched = await getActiveCampaign({ vendorId });
		expect(fetched).not.toBeNull();
		expect(fetched!.threshold).toBe(10);
		expect(fetched!.vendorId.toString()).toBe(vendorId);
	});

	it("returns null for inactive campaign", async () => {
		await endCampaign({ vendorId });
		const result = await getActiveCampaign({ vendorId });
		expect(result).toBeNull();
	});
});

describe("referralLinks service", () => {
	const vendorId = oid();
	const creatorUserId = oid();

	it("generates a unique token on first call", async () => {
		const link = await getOrCreateLink({ vendorId, creatorUserId });
		expect(link.token).toBeTruthy();
		expect(link.vendorId.toString()).toBe(vendorId);
		expect(link.creatorUserId.toString()).toBe(creatorUserId);
	});

	it("returns the same link on subsequent calls", async () => {
		const first = await getOrCreateLink({ vendorId, creatorUserId });
		const second = await getOrCreateLink({ vendorId, creatorUserId });
		expect(first.token).toBe(second.token);
	});

	it("resolves token to vendor and creator", async () => {
		const link = await getOrCreateLink({ vendorId, creatorUserId });
		const resolved = await resolveLinkByToken({ token: link.token });
		expect(resolved).not.toBeNull();
		expect(resolved!.vendorId.toString()).toBe(vendorId);
		expect(resolved!.creatorUserId.toString()).toBe(creatorUserId);
	});
});

describe("referral credit eligibility", () => {
	const vendorId = oid();
	const creatorUserId = oid();
	const referredUserId = oid();
	const buyerOrderId = oid();
	const ip = "192.168.1.1";

	afterEach(async () => {
		await Referral.deleteMany({});
		await ReferralCampaign.deleteMany({});
	});

	it("rejects when campaign is inactive", async () => {
		const result = await creditReferralIfEligible({
			vendorId,
			creatorUserId,
			referredUserId,
			buyerOrderId,
			ip,
		});
		expect(result.outcome).toBe("rejected");
		expect(result.reason).toBe("CAMPAIGN_INACTIVE");
	});

	it("accepts when campaign is active and no collisions", async () => {
		const created = await createReferralCampaignDB({
			payload: {
				vendorId,
				isActive: true,
				startDate: new Date(),
				endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
				threshold: 10,
				rewardExpiryDays: 30,
				rewardType: "FREE_MEAL",
			},
		});
		const campaignId = created!._id.toString();

		const result = await creditReferralIfEligible({
			vendorId,
			creatorUserId,
			referredUserId,
			buyerOrderId,
			ip,
		});
		expect(result.outcome).toBe("accepted");
	});

	it("rejects duplicate credit for same user in same campaign", async () => {
		const created = await createReferralCampaignDB({
			payload: {
				vendorId,
				isActive: true,
				startDate: new Date(),
				endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
				threshold: 10,
				rewardExpiryDays: 30,
				rewardType: "FREE_MEAL",
			},
		});
		const campaignId = created!._id.toString();

		await createReferralDB({
			payload: {
				vendorId,
				creatorUserId,
				referredUserId,
				buyerOrderId: oid(),
				campaignId,
				ipHash: hashIp("10.0.0.1"),
			},
		});

		const result = await creditReferralIfEligible({
			vendorId,
			creatorUserId,
			referredUserId,
			buyerOrderId: oid(),
			ip: "10.0.0.1",
		});
		expect(result.outcome).toBe("rejected");
		expect(result.reason).toBe("ALREADY_CREDITED");
	});

	it("flags IP collision only", async () => {
		const newBuyerId = oid();

		const created = await createReferralCampaignDB({
			payload: {
				vendorId,
				isActive: true,
				startDate: new Date(),
				endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
				threshold: 10,
				rewardExpiryDays: 30,
				rewardType: "FREE_MEAL",
			},
		});
		const campaignId = created!._id.toString();

		await createReferralDB({
			payload: {
				vendorId,
				creatorUserId,
				referredUserId: oid(),
				buyerOrderId: oid(),
				campaignId,
				ipHash: hashIp(ip),
			},
		});

		const result = await creditReferralIfEligible({
			vendorId,
			creatorUserId,
			referredUserId: newBuyerId,
			buyerOrderId: oid(),
			ip,
		});
		expect(result.outcome).toBe("flagged_ip");
		expect(result.reason).toBe("IP_COLLISION");
	});

	it("rejects IP + device collision", async () => {
		const newBuyerId = oid();
		const deviceId = "device-123";

		const created = await createReferralCampaignDB({
			payload: {
				vendorId,
				isActive: true,
				startDate: new Date(),
				endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
				threshold: 10,
				rewardExpiryDays: 30,
				rewardType: "FREE_MEAL",
			},
		});
		const campaignId = created!._id.toString();

		await createReferralDB({
			payload: {
				vendorId,
				creatorUserId,
				referredUserId: oid(),
				buyerOrderId: oid(),
				campaignId,
				ipHash: hashIp(ip),
				deviceId,
			},
		});

		const result = await creditReferralIfEligible({
			vendorId,
			creatorUserId,
			referredUserId: newBuyerId,
			buyerOrderId: oid(),
			ip,
			deviceId,
		});
		expect(result.outcome).toBe("rejected");
		expect(result.reason).toBe("IP_AND_DEVICE_COLLISION");
	});
});

describe("referral fraud checks", () => {
	const vendorId = oid();
	const creatorUserId = oid();
	const campaignId = oid();

	beforeEach(async () => {
		await createReferralCampaignDB({
			payload: {
				vendorId,
				campaignId,
				isActive: true,
				startDate: new Date(),
				endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
				threshold: 10,
				rewardExpiryDays: 30,
				rewardType: "FREE_MEAL",
			},
		});
	});

	it("detects IP collision", async () => {
		const ipHash = hashIp("192.168.1.100");
		await createReferralDB({
			payload: {
				vendorId,
				creatorUserId,
				referredUserId: oid(),
				buyerOrderId: oid(),
				campaignId,
				ipHash,
			},
		});

		const collision = await checkIpCollision({
			vendorId,
			creatorUserId,
			campaignId,
			ipHash,
			excludeBuyerOrderId: oid(),
		});
		expect(collision).not.toBeNull();
	});

	it("detects device collision", async () => {
		const deviceId = "device-abc";
		await createReferralDB({
			payload: {
				vendorId,
				creatorUserId,
				referredUserId: oid(),
				buyerOrderId: oid(),
				campaignId,
				ipHash: hashIp("10.0.0.1"),
				deviceId,
			},
		});

		const collision = await checkDeviceCollision({
			vendorId,
			creatorUserId,
			campaignId,
			deviceId,
			excludeBuyerOrderId: oid(),
		});
		expect(collision).not.toBeNull();
	});
});
