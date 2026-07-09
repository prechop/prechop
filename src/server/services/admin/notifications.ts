import { listUsersDB } from "../../models";
import { recordAudit } from "../audit";
import { createUserNotification } from "../notifications/createUserNotification";
import type { AdminActor } from "./vendors";

/**
 * Broadcast an in-app (+ push) notification to users, optionally scoped to a
 * campus. Delivery per user is fire-and-forget and never throws.
 */
export async function broadcastNotification({
	title,
	body,
	campusId,
	actor,
}: {
	title: string;
	body: string;
	campusId?: string;
	actor: AdminActor;
}): Promise<{ recipients: number }> {
	// Page through users so a large audience doesn't load all at once.
	// `listUsersDB` caps its page size at 100, so match that here.
	const pageSize = 100;
	let skip = 0;
	let recipients = 0;
	for (;;) {
		const { users } = await listUsersDB({
			campusId,
			skip,
			limit: pageSize,
		});
		if (users.length === 0) break;
		await Promise.all(
			users.map((u) =>
				createUserNotification({
					userId: u._id.toString(),
					title,
					body,
					type: "ADMIN_BROADCAST",
				}),
			),
		);
		recipients += users.length;
		if (users.length < pageSize) break;
		skip += pageSize;
	}

	recordAudit({
		userId: actor.userId,
		role: actor.role,
		action: "NOTIFICATION_BROADCAST",
		resourceType: "notifications",
		newState: { title, body, campusId: campusId ?? "all", recipients },
		ipAddress: actor.ip,
		userAgent: actor.userAgent,
	});

	return { recipients };
}
