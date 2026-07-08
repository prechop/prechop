import {
	countUnreadNotificationsDB,
	listNotificationsDB,
	markAllNotificationsReadDB,
	markNotificationReadDB,
} from "../../models";

export async function listNotifications({
	userId,
	limit,
	offset,
}: {
	userId: string;
	limit?: number;
	offset?: number;
}) {
	const [items, unread] = await Promise.all([
		listNotificationsDB({ userId, limit, offset }),
		countUnreadNotificationsDB({ userId }),
	]);
	return { items, unread };
}

export function markNotificationRead({
	id,
	userId,
}: {
	id: string;
	userId: string;
}) {
	return markNotificationReadDB({ id, userId });
}

export function markAllNotificationsRead({ userId }: { userId: string }) {
	return markAllNotificationsReadDB({ userId });
}

export function getUnreadCount({ userId }: { userId: string }) {
	return countUnreadNotificationsDB({ userId });
}
