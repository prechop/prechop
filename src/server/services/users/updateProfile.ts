import { ErrUserNotFound } from "../../constants";
import { updateUserProfileDB } from "../../models";
import type { IUserPublic } from "../../models/users/types";
import { resolvePermissions } from "../iam";
import { toPublicUser } from "./toPublicUser";

/** Update the authenticated user's first/last name. */
export async function updateProfile({
	userId,
	firstName,
	lastName,
}: {
	userId: string;
	firstName?: string;
	lastName?: string;
}): Promise<IUserPublic> {
	const updated = await updateUserProfileDB({
		id: userId,
		firstName,
		lastName,
	});
	if (!updated) throw ErrUserNotFound;
	const resolved = await resolvePermissions(userId);
	return toPublicUser(updated, {
		groups: resolved.groups,
		permissions: resolved.actions,
	});
}
