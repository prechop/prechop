import {
	AppError,
	verifyOtp as compareOtp,
	ErrOtpInvalid,
	ErrUnauthorized,
	NIGERIAN_PHONE_ERROR_MESSAGE,
	normalizeNigerianMobilePhone,
	validationError,
} from "../../constants";
import { Redis } from "../../databases";
import {
	getUserByPhoneDB,
	loginUserDB,
	markPhoneVerifiedDB,
	updateLastLoginDB,
} from "../../models";
import type { IUserPublic } from "../../models/users/types";
import { termiiProvider } from "../../providers";
import type { IJwtPayload } from "../../types";
import { resolvePermissions } from "../iam";
import { toPublicUser } from "../users/toPublicUser";
import { autoProvisionBuyer } from "./register";
import { otpKey, otpRateLimitKey, otpVerifyRateLimitKey } from "./requestOtp";

// A 6-digit code has 1e6 possibilities but only a 10-minute life. Without a
// per-phone attempt cap the generic per-IP route limit is no defence: an
// attacker rotates IPs and walks the keyspace against one victim's number.
// PRD §8.1: 5 verification attempts per phone per 10 minutes.
const OTP_VERIFY_WINDOW_SECONDS = 60 * 10; // 10 min
const OTP_VERIFY_MAX_ATTEMPTS = 5;

type StoredProviderOtp = {
	provider: "termii";
	pinId: string;
};

const ErrOtpVerifyRateLimited = (): AppError =>
	new AppError(
		"Too many verification attempts. Request a new code in 10 minutes.",
		429,
		"OTP_VERIFY_RATE_LIMITED",
	);

function parseProviderOtp(value: string): StoredProviderOtp | null {
	try {
		const parsed = JSON.parse(value) as Partial<StoredProviderOtp>;
		if (parsed.provider === "termii" && typeof parsed.pinId === "string") {
			return parsed as StoredProviderOtp;
		}
	} catch {
		return null;
	}
	return null;
}

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
	const normalizedPhone = normalizeNigerianMobilePhone(phone);
	if (!normalizedPhone) throw validationError(NIGERIAN_PHONE_ERROR_MESSAGE);

	// Count the attempt *before* the code is compared, so a guess that lands
	// after the budget is spent still loses. The window is fixed from the first
	// attempt and is NOT extended by later ones — an attacker cannot keep the
	// key alive to starve the victim beyond 10 minutes.
	const verifyKey = otpVerifyRateLimitKey(normalizedPhone);
	const verifyAttempts = await Redis.incr(verifyKey);
	if (verifyAttempts === 1) {
		await Redis.expire(verifyKey, OTP_VERIFY_WINDOW_SECONDS);
	} else if ((await Redis.ttl(verifyKey)) < 0) {
		// INCR created/kept the key but the EXPIRE never landed (crash or a
		// failed round-trip). Without this the counter is immortal and the
		// number is locked out for good — a self-inflicted DoS.
		await Redis.expire(verifyKey, OTP_VERIFY_WINDOW_SECONDS);
	}
	if (verifyAttempts > OTP_VERIFY_MAX_ATTEMPTS)
		throw ErrOtpVerifyRateLimited();

	const storedHash = await Redis.get(otpKey(normalizedPhone));
	if (!storedHash) throw ErrOtpInvalid;

	const providerOtp = parseProviderOtp(storedHash);
	let valid = false;
	if (providerOtp?.provider === "termii") {
		try {
			valid = await termiiProvider.verifyOtp(providerOtp.pinId, otp);
		} catch {
			valid = false;
		}
	} else {
		valid = await compareOtp(otp, storedHash);
	}
	if (!valid) throw ErrOtpInvalid;

	// Single-use — delete immediately on success.
	await Redis.del(otpKey(normalizedPhone));
	await Redis.del(otpRateLimitKey(normalizedPhone));
	// Clear the verify budget so a legitimate user who fat-fingered a few codes
	// isn't still throttled on their next sign-in.
	await Redis.del(verifyKey);

	// A verified phone with no account is a first-time sign-in: provision a
	// lightweight buyer so there is a single login for everyone (unified login).
	const user =
		(await getUserByPhoneDB({ phone: normalizedPhone })) ??
		(await autoProvisionBuyer(normalizedPhone));
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
