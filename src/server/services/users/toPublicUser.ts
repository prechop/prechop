import { tryDecrypt } from "../../constants";
import type { IUser, IUserPublic } from "../../models/users/types";

/**
 * Project a raw user document (which may carry an encrypted `phone`) into the
 * client-safe shape. Safe to call on both aggregate results (phone stripped)
 * and `getUserByPhoneDB` results (phone present + encrypted).
 */
export function toPublicUser(user: IUser): IUserPublic {
	return {
		id: (user.id ?? user._id)?.toString(),
		campusId: user.campusId?.toString(),
		role: user.role,
		firstName: user.firstName,
		lastName: user.lastName,
		phone: user.phone ? tryDecrypt(user.phone) : "",
		isPhoneVerified: user.isPhoneVerified,
		isActive: user.isActive,
		createdAt: user.createdAt,
	};
}
