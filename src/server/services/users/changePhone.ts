import {
	verifyOtp as compareOtp,
	conflict,
	ErrOtpInvalid,
	ErrUserNotFound,
} from "@/server/constants";
import { Redis } from "@/server/databases";
import { getUserByPhoneDB, updateUserPhoneDB } from "@/server/models";
import { otpKey, otpRateLimitKey, requestOtp } from "../auth/requestOtp";
import { resolvePermissions } from "../iam";
import { toPublicUser } from "./toPublicUser";

export async function requestPhoneChangeOtp({
	userId,
	phone,
}: {
	userId: string;
	phone: string;
}) {
	const existing = await getUserByPhoneDB({ phone });
	if (existing && existing._id.toString() !== userId) {
		throw conflict("That phone number is already in use.");
	}
	return requestOtp(phone);
}

export async function confirmPhoneChange({
	userId,
	phone,
	otp,
}: {
	userId: string;
	phone: string;
	otp: string;
}) {
	const existing = await getUserByPhoneDB({ phone });
	if (existing && existing._id.toString() !== userId) {
		throw conflict("That phone number is already in use.");
	}
	const storedHash = await Redis.get(otpKey(phone));
	if (!storedHash) throw ErrOtpInvalid;
	const valid = await compareOtp(otp, storedHash);
	if (!valid) throw ErrOtpInvalid;
	await Redis.del(otpKey(phone));
	await Redis.del(otpRateLimitKey(phone));

	const updated = await updateUserPhoneDB({ id: userId, phone });
	if (!updated) throw ErrUserNotFound;
	const resolved = await resolvePermissions(userId);
	return toPublicUser(updated, {
		groups: resolved.groups,
		permissions: resolved.actions,
	});
}
