import { ErrUserNotFound } from "../../constants";
import { getUserByIdWithPhoneDB } from "../../models";
import type { IUserPublic } from "../../models/users/types";
import { resolvePermissions } from "../iam";
import { toPublicUser } from "./toPublicUser";

/** Fetch the authenticated user's own profile (phone decrypted) + resolved IAM. */
export async function getMe({
	userId,
}: {
	userId: string;
}): Promise<IUserPublic> {
	const user = await getUserByIdWithPhoneDB({ id: userId });
	if (!user) throw ErrUserNotFound;
	const resolved = await resolvePermissions(userId);
	return toPublicUser(user, {
		groups: resolved.groups,
		permissions: resolved.actions,
	});
}
