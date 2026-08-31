import { redisRetrieveKeyString, redisUpdateKeyString, redisDeleteKeys } from "@/server/databases/redis";

const ATTRIBUTION_TTL_SECONDS = 14 * 24 * 60 * 60;
const ATTRIBUTION_KEY_PREFIX = "referral:attribution:";

export async function getAttributionByToken(
	token: string,
): Promise<{ vendorId: string; creatorUserId: string } | null> {
	const key = `${ATTRIBUTION_KEY_PREFIX}${token}`;
	const data = await redisRetrieveKeyString<{ vendorId: string; creatorUserId: string }>(key);
	if (!data) return null;

	await redisDeleteKeys(key).catch(() => {});
	return data;
}

export async function setAttributionToken({
	token,
	vendorId,
	creatorUserId,
}: {
	token: string;
	vendorId: string;
	creatorUserId: string;
}): Promise<boolean> {
	const key = `${ATTRIBUTION_KEY_PREFIX}${token}`;
	return redisUpdateKeyString(
		key,
		{ vendorId, creatorUserId },
		true,
		ATTRIBUTION_TTL_SECONDS,
	);
}
