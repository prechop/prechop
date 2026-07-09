import { ErrMenuItemNotFound } from "../../constants";
import {
	adminSetMenuAvailabilityDB,
	getMenuItemByIdDB,
	listAllMenuItemsDB,
} from "../../models";
import { recordAudit } from "../audit";
import type { AdminActor } from "./vendors";

export async function listCatalog({
	campusId,
	search,
	page = 1,
	pageSize = 50,
}: {
	campusId?: string;
	search?: string;
	page?: number;
	pageSize?: number;
}) {
	const p = Math.max(1, page);
	const size = Math.min(100, Math.max(1, pageSize));
	const { items, total } = await listAllMenuItemsDB({
		campusId,
		search,
		skip: (p - 1) * size,
		limit: size,
	});
	return { items, total, page: p };
}

export async function setCatalogItemAvailability({
	id,
	isAvailable,
	actor,
}: {
	id: string;
	isAvailable: boolean;
	actor: AdminActor;
}) {
	const item = await getMenuItemByIdDB({ id });
	if (!item) throw ErrMenuItemNotFound;
	await adminSetMenuAvailabilityDB({ id, isAvailable });
	recordAudit({
		userId: actor.userId,
		role: actor.role,
		action: isAvailable ? "MENU_RESTORE" : "MENU_TAKEDOWN",
		resourceType: "menuItems",
		resourceId: id,
		previousState: { isAvailable: item.isAvailable },
		newState: { isAvailable },
		ipAddress: actor.ip,
		userAgent: actor.userAgent,
	});
	return { ...item, isAvailable };
}
