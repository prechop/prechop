import { ErrUserNotFound } from "../../constants";
import { getUserByIdWithPhoneDB } from "../../models";
import type { IUserPublic } from "../../models/users/types";
import { toPublicUser } from "./toPublicUser";

/** Fetch the authenticated user's own profile (phone decrypted). */
export async function getMe({
	userId,
}: {
	userId: string;
}): Promise<IUserPublic> {
	const user = await getUserByIdWithPhoneDB({ id: userId });
	if (!user) throw ErrUserNotFound;
	return toPublicUser(user);
}
