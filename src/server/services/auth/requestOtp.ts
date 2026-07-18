import {
  ErrOtpRateLimited,
  generateOtp,
  hashOtp,
  NIGERIAN_PHONE_ERROR_MESSAGE,
  normalizeNigerianMobilePhone,
  validationError,
} from "../../constants";
import { Redis } from "../../databases";
import { sendchampProvider } from "../../providers";

const OTP_TTL_SECONDS = 60 * 10; // 10 min
const OTP_RATE_LIMIT_WINDOW_SECONDS = 60 * 30; // 30 min
const OTP_MAX_ATTEMPTS = 5;

// const OTP_TTL_SECONDS = 60 * 10; // 10 minutes
// const OTP_RATE_LIMIT_WINDOW_SECONDS = 60 * 1; // 1 minute
// const OTP_MAX_ATTEMPTS = 5;

export function otpKey(phone: string): string {
  return `otp:code:${phone}`;
}
export function otpRateLimitKey(phone: string): string {
  return `otp:ratelimit:${phone}`;
}
/** Per-phone counter for OTP *verification* attempts (brute-force guard). */
export function otpVerifyRateLimitKey(phone: string): string {
  return `otp:verify:ratelimit:${phone}`;
}

export async function requestOtp(phone: string): Promise<{ message: string }> {
  const normalizedPhone = normalizeNigerianMobilePhone(phone);
  if (!normalizedPhone) throw validationError(NIGERIAN_PHONE_ERROR_MESSAGE);

  const rlKey = otpRateLimitKey(normalizedPhone);
  const attempts = await Redis.incr(rlKey);
  if (attempts === 1) {
    await Redis.expire(rlKey, OTP_RATE_LIMIT_WINDOW_SECONDS);
  } else if ((await Redis.ttl(rlKey)) < 0) {
    // INCR created/kept the key but the EXPIRE never landed (crash or a
    // failed round-trip). Without this the counter is immortal and the
    // number is locked out for good — a self-inflicted DoS. Mirrors the
    // same guard in verifyOtp.
    await Redis.expire(rlKey, OTP_RATE_LIMIT_WINDOW_SECONDS);
  }
  if (attempts > OTP_MAX_ATTEMPTS) throw ErrOtpRateLimited;

  const otp = generateOtp();
  const hashed = await hashOtp(otp);
  await Redis.setex(otpKey(normalizedPhone), OTP_TTL_SECONDS, hashed);

  try {
    await sendchampProvider.sendOtp(normalizedPhone, otp);
  } catch (error) {
    console.error("OTP SMS delivery failed:", error);
    throw validationError(
      "Could not send OTP. Please check your phone number and try again.",
    );
  }

  return { message: "OTP sent successfully." };
}
