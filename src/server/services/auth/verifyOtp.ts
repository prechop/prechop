import {
	verifyOtp as compareOtp,
	ErrOtpInvalid,
	ErrUnauthorized,
} from "../../constants";
import { Redis } from "../../databases";
import {
	getUserByPhoneDB,
	loginUserDB,
	markPhoneVerifiedDB,
	updateLastLoginDB,
} from "../../models";
import type { IUserPublic } from "../../models/users/types";
import type { IJwtPayload } from "../../types";
import { resolvePermissions } from "../iam";
import { toPublicUser } from "../users/toPublicUser";
import { autoProvisionBuyer } from "./register";
import { otpKey, otpRateLimitKey } from "./requestOtp";

export interface VerifyOtpResult {
	token: IJwtPayload;
	user: IUserPublic;
}

export async function verifyOtpService({
	phone,
	otp,
	ip,
}: {
	phone: string;
	otp: string;
	ip: string;
}): Promise<VerifyOtpResult> {
	const storedHash = await Redis.get(otpKey(phone));
	if (!storedHash) throw ErrOtpInvalid;

	const valid = await compareOtp(otp, storedHash);
	if (!valid) throw ErrOtpInvalid;

	// Single-use — delete immediately on success.
	await Redis.del(otpKey(phone));
	await Redis.del(otpRateLimitKey(phone));

	// A verified phone with no account is a first-time sign-in: provision a
	// lightweight buyer so there is a single login for everyone (unified login).
	const user =
		(await getUserByPhoneDB({ phone })) ??
		(await autoProvisionBuyer(phone));
	if (!user) throw ErrUnauthorized;
	if (!user.isActive) throw ErrUnauthorized;

	if (!user.isPhoneVerified) {
		await markPhoneVerifiedDB({ id: user._id.toString() });
	} else {
		await updateLastLoginDB({ id: user._id.toString() });
	}

	const token = await loginUserDB({ id: user._id.toString(), ip });
	if (!token) throw ErrUnauthorized;

	const resolved = await resolvePermissions(user._id.toString());
	return {
		token,
		user: toPublicUser(user, {
			groups: resolved.groups,
			permissions: resolved.actions,
		}),
	};
}
