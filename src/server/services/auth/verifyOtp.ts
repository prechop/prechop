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
import type { IJwtPayload } from "../../types";
import { toPublicUser } from "../users/toPublicUser";
import { otpKey, otpRateLimitKey } from "./requestOtp";

export interface VerifyOtpResult {
	token: IJwtPayload;
	user: ReturnType<typeof toPublicUser>;
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

	const user = await getUserByPhoneDB({ phone });
	if (!user) throw ErrUnauthorized;
	if (!user.isActive) throw ErrUnauthorized;

	if (!user.isPhoneVerified) {
		await markPhoneVerifiedDB({ id: user._id.toString() });
	} else {
		await updateLastLoginDB({ id: user._id.toString() });
	}

	const token = await loginUserDB({ id: user._id.toString(), ip });
	if (!token) throw ErrUnauthorized;

	return { token, user: toPublicUser(user) };
}
