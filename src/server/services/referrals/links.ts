import crypto from "node:crypto";
import {
	createReferralLinkDB,
	getReferralLinkByCreatorDB,
	getReferralLinkByTokenDB,
	type IReferralLink,
	type IReferralLinkCreateInput,
} from "@/server/models/referralLinks";

export function generateReferralToken(): string {
	return crypto.randomBytes(32).toString("base64url");
}

export async function getOrCreateLink({
	vendorId,
	creatorUserId,
}: {
	vendorId: string;
	creatorUserId: string;
}): Promise<IReferralLink> {
	const existing = await getReferralLinkByCreatorDB({ vendorId, creatorUserId });
	if (existing) return existing;

	const token = generateReferralToken();
	const input: IReferralLinkCreateInput = {
		vendorId,
		creatorUserId,
		token,
	};

	const created = await createReferralLinkDB({ payload: input });
	if (!created) throw new Error("Failed to create referral link");
	return created;
}

export async function resolveLinkByToken({
	token,
}: {
	token: string;
}): Promise<{ vendorId: string; creatorUserId: string } | null> {
	const link = await getReferralLinkByTokenDB({ token });
	if (!link) return null;
	return {
		vendorId: link.vendorId,
		creatorUserId: link.creatorUserId,
	};
}
