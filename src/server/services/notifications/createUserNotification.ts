import {
	createNotificationDB,
	deletePushSubscriptionByEndpointDB,
	type INotification,
	listPushSubscriptionsByUserDB,
} from "../../models";
import { sendPush } from "../../providers/push";

/**
 * Persist an in-app notification for a user and fan it out to their web-push
 * subscriptions. Push delivery is fire-and-forget; dead subscriptions
 * (404/410) are pruned. Never throws — notification delivery must not fail the
 * action that triggered it.
 */
export async function createUserNotification({
	userId,
	title,
	body,
	type,
	data,
	dedupeKey,
}: {
	userId: string;
	title: string;
	body: string;
	type: string;
	data?: Record<string, unknown>;
	dedupeKey?: string;
}): Promise<{ created: boolean; notification: INotification | null }> {
	let notification: INotification | null = null;
	let created = false;
	try {
		notification = await createNotificationDB({
			payload: {
				userId,
				title,
				body,
				type,
				dedupeKey,
				data,
				isRead: false,
			},
		});
		created = notification?.wasCreated !== false;
		if (!notification) {
			console.error(
				`[notifications] failed to persist notification userId=${userId} type=${type} dedupeKey=${dedupeKey ?? "none"}`,
			);
		}
	} catch (error) {
		console.error(
			`[notifications] failed to persist notification userId=${userId} type=${type} dedupeKey=${dedupeKey ?? "none"}:`,
			error,
		);
	}

	// Fire-and-forget push fan-out.
	if (created) void dispatchPush(userId, { title, body, type, data });
	return { created, notification };
}

async function dispatchPush(
	userId: string,
	payload: Record<string, unknown>,
): Promise<void> {
	try {
		const subs = await listPushSubscriptionsByUserDB({ userId });
		await Promise.allSettled(
			subs.map(async (sub) => {
				const res = await sendPush(
					{ endpoint: sub.endpoint, keys: sub.keys },
					payload,
				);
				if (res.gone) {
					await deletePushSubscriptionByEndpointDB({
						endpoint: sub.endpoint,
					});
				}
			}),
		);
	} catch (error) {
		console.error("[notifications] push dispatch failed:", error);
	}
}
