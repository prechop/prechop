import "server-only";
import webpush from "web-push";
import {
	VAPID_PRIVATE_KEY,
	VAPID_PUBLIC_KEY,
	VAPID_SUBJECT,
} from "../constants";

let configured = false;
function ensureConfigured(): boolean {
	if (configured) return true;
	if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
	webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
	configured = true;
	return true;
}

export interface PushSubscriptionShape {
	endpoint: string;
	keys: { p256dh: string; auth: string };
}

export interface PushResult {
	ok: boolean;
	// 404/410 → the subscription is dead and should be pruned by the caller.
	gone: boolean;
	statusCode?: number;
}

export async function sendPush(
	subscription: PushSubscriptionShape,
	payload: Record<string, unknown>,
): Promise<PushResult> {
	if (!ensureConfigured()) return { ok: false, gone: false };
	try {
		await webpush.sendNotification(
			subscription as unknown as webpush.PushSubscription,
			JSON.stringify(payload),
		);
		return { ok: true, gone: false };
	} catch (error) {
		const statusCode = (error as { statusCode?: number })?.statusCode;
		const gone = statusCode === 404 || statusCode === 410;
		return { ok: false, gone, statusCode };
	}
}

export const pushProvider = { sendPush };
