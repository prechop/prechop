import { tryDecrypt } from "../../constants";
import type { IUser, IUserPublic } from "../../models/users/types";

/**
 * Project a raw user document into the client-safe shape. `groups` and
 * `permissions` are the caller's resolved IAM group names & effective action
 * strings — supplied by the caller (e.g. `getMe`), which resolves them once.
 */
export function toPublicUser(
	user: IUser,
	resolved: { groups: string[]; permissions: string[] },
): IUserPublic {
	return {
		id: (user.id ?? user._id)?.toString(),
		campusId: user.campusId?.toString(),
		groups: resolved.groups,
		permissions: resolved.permissions,
		firstName: user.firstName,
		lastName: user.lastName,
		phone: user.phone ? tryDecrypt(user.phone) : "",
		// Only ever returned to the owning user (every `toPublicUser` caller
		// projects the caller's own record). Omitted entirely when unset, so the
		// client can distinguish "no email" from an empty string it typed.
		...(user.email ? { email: user.email } : {}),
		isPhoneVerified: user.isPhoneVerified,
		isActive: user.isActive,
		createdAt: user.createdAt,
	};
}
