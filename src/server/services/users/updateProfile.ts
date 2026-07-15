import { ErrUserNotFound, validationError } from "../../constants";
import { normalizeEmail, updateUserProfileDB } from "../../models";
import type { IUserPublic } from "../../models/users/types";
import { resolvePermissions } from "../iam";
import { toPublicUser } from "./toPublicUser";

/**
 * Update the authenticated user's own first/last name and optional contact
 * email. Omitted fields are left untouched.
 *
 * `email` is a best-effort notification address, not a credential: it is never
 * required, changing it does not affect login (phone + OTP), and passing `""`
 * clears it. Rejecting a malformed address here — rather than letting the schema
 * validator surface it as a generic failure — is what turns it into a 400.
 */
export async function updateProfile({
	userId,
	firstName,
	lastName,
	email,
}: {
	userId: string;
	firstName?: string;
	lastName?: string;
	/** `""` clears the address; `undefined` leaves it untouched. */
	email?: string;
}): Promise<IUserPublic> {
	let normalizedEmail: string | null | undefined;
	if (email !== undefined) {
		normalizedEmail = normalizeEmail(email);
		if (normalizedEmail === undefined) {
			throw validationError("Enter a valid email address.");
		}
	}

	const updated = await updateUserProfileDB({
		id: userId,
		firstName,
		lastName,
		email: email === undefined ? undefined : normalizedEmail,
	});
	if (!updated) throw ErrUserNotFound;
	const resolved = await resolvePermissions(userId);
	return toPublicUser(updated, {
		groups: resolved.groups,
		permissions: resolved.actions,
	});
}
