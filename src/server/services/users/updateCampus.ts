import { ErrUserNotFound, validationError } from "../../constants";
import { getCampusByIdDB, updateUserProfileDB } from "../../models";
import type { IUserPublic } from "../../models/users/types";
import { resolvePermissions } from "../iam";
import { toPublicUser } from "./toPublicUser";

/**
 * Move the authenticated user to a different campus. Rejects unknown or
 * inactive campuses with a 400 before touching the user document.
 */
export async function updateCampus({
	userId,
	campusId,
}: {
	userId: string;
	campusId: string;
}): Promise<IUserPublic> {
	const campus = await getCampusByIdDB({ id: campusId });
	if (!campus?.isActive) {
		throw validationError("Invalid or inactive campus.");
	}
	const updated = await updateUserProfileDB({ id: userId, campusId });
	if (!updated) throw ErrUserNotFound;
	const resolved = await resolvePermissions(userId);
	return toPublicUser(updated, {
		groups: resolved.groups,
		permissions: resolved.actions,
	});
}
