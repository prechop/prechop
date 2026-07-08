import { VAPID_PUBLIC_KEY } from "../../constants";
import { upsertPushSubscriptionDB } from "../../models";

export function getVapidPublicKey(): { publicKey: string } {
	return { publicKey: VAPID_PUBLIC_KEY };
}

export async function subscribePush({
	userId,
	endpoint,
	keys,
	userAgent,
}: {
	userId: string;
	endpoint: string;
	keys: { p256dh: string; auth: string };
	userAgent?: string;
}) {
	return upsertPushSubscriptionDB({ userId, endpoint, keys, userAgent });
}
