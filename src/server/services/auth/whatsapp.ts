import { randomBytes } from "node:crypto";
import {
	AppError,
	hash,
	normalizeNigerianMobilePhone,
} from "@/server/constants";
import { Redis } from "@/server/databases";
import {
	sendchampProvider,
	type VerificationChallenge,
} from "@/server/providers";
import type { AuthResult } from "./register";
import { cleanAuthNext, signInWithVerifiedPhone } from "./register";

const OTP_TTL_SECONDS = 5 * 60;
const RESEND_COOLDOWN_SECONDS = 60;
const REQUEST_WINDOW_SECONDS = 60 * 60;
const MAX_REQUESTS_PER_PHONE = 5;
const MAX_VERIFY_ATTEMPTS = 5;

interface WhatsAppChallenge {
	phone: string;
	providerReference: string;
	next: string;
}

function challengeKey(id: string): string {
	return `auth:whatsapp:challenge:${hash(id)}`;
}

function attemptsKey(id: string): string {
	return `auth:whatsapp:attempts:${hash(id)}`;
}

function activeChallengeKey(phone: string): string {
	return phoneKey("active", phone);
}

function phoneKey(kind: string, phone: string): string {
	return `auth:whatsapp:${kind}:${hash(phone)}`;
}

export async function requestWhatsAppSignIn({
	phone,
	next,
}: {
	phone: string;
	next?: string;
}): Promise<{
	challengeId: string;
	maskedPhone: string;
	expiresInSeconds: number;
	resendAfterSeconds: number;
	devOtp?: string;
}> {
	const normalized = normalizeNigerianMobilePhone(phone);
	if (!normalized) {
		throw new AppError(
			"Enter a valid Nigerian phone number.",
			400,
			"INVALID_PHONE",
		);
	}

	const cooldownKey = phoneKey("cooldown", normalized);
	const cooldownSet = await Redis.set(
		cooldownKey,
		"1",
		"EX",
		RESEND_COOLDOWN_SECONDS,
		"NX",
	);
	if (cooldownSet !== "OK") {
		throw new AppError(
			"Please wait before requesting another code.",
			429,
			"WHATSAPP_OTP_COOLDOWN",
		);
	}

	const requestKey = phoneKey("requests", normalized);
	const requestCount = await Redis.incr(requestKey);
	if (requestCount === 1)
		await Redis.expire(requestKey, REQUEST_WINDOW_SECONDS);
	if (requestCount > MAX_REQUESTS_PER_PHONE) {
		throw new AppError(
			"Too many verification requests. Please try again later.",
			429,
			"WHATSAPP_OTP_RATE_LIMITED",
		);
	}

	let providerChallenge: VerificationChallenge;
	try {
		providerChallenge =
			await sendchampProvider.createWhatsAppVerification(normalized);
	} catch {
		await Redis.del(cooldownKey);
		await Redis.decr(requestKey);
		throw new AppError(
			"We could not send a WhatsApp code right now. Please try again.",
			503,
			"WHATSAPP_OTP_UNAVAILABLE",
		);
	}

	const challengeId = randomBytes(24).toString("base64url");
	const challenge: WhatsAppChallenge = {
		phone: normalized,
		providerReference: providerChallenge.reference,
		next: cleanAuthNext(next),
	};
	const activeKey = activeChallengeKey(normalized);
	const previousChallengeId = await Redis.get(activeKey);
	if (previousChallengeId) {
		await Redis.del(
			challengeKey(previousChallengeId),
			attemptsKey(previousChallengeId),
		);
	}
	await Redis.setex(
		challengeKey(challengeId),
		OTP_TTL_SECONDS,
		JSON.stringify(challenge),
	);
	await Redis.setex(activeKey, OTP_TTL_SECONDS, challengeId);
	return {
		challengeId,
		maskedPhone: `${normalized.slice(0, 7)}****${normalized.slice(-3)}`,
		expiresInSeconds: OTP_TTL_SECONDS,
		resendAfterSeconds: RESEND_COOLDOWN_SECONDS,
		...(providerChallenge.devOtp
			? { devOtp: providerChallenge.devOtp }
			: {}),
	};
}

export async function verifyWhatsAppSignIn({
	challengeId,
	code,
	ip,
}: {
	challengeId: string;
	code: string;
	ip: string;
}): Promise<AuthResult & { next: string }> {
	const key = challengeKey(challengeId);
	const raw = await Redis.get(key);
	if (!raw) {
		throw new AppError(
			"This verification code has expired. Request a new one.",
			403,
			"WHATSAPP_OTP_EXPIRED",
		);
	}
	const challenge = JSON.parse(raw) as WhatsAppChallenge;
	const activeKey = activeChallengeKey(challenge.phone);
	if ((await Redis.get(activeKey)) !== challengeId) {
		await Redis.del(key, attemptsKey(challengeId));
		throw new AppError(
			"This verification code has expired. Request a new one.",
			403,
			"WHATSAPP_OTP_EXPIRED",
		);
	}
	const attemptKey = attemptsKey(challengeId);
	const attempts = await Redis.incr(attemptKey);
	if (attempts === 1) {
		const remainingTtl = await Redis.ttl(key);
		await Redis.expire(attemptKey, Math.max(1, remainingTtl));
	}
	if (attempts > MAX_VERIFY_ATTEMPTS) {
		await Redis.del(key, attemptKey, activeKey);
		throw new AppError(
			"Too many incorrect attempts. Request a new code.",
			429,
			"WHATSAPP_OTP_ATTEMPTS_EXCEEDED",
		);
	}

	let verified = false;
	try {
		verified = await sendchampProvider.confirmWhatsAppVerification(
			challenge.providerReference,
			code,
		);
	} catch {
		await Redis.decr(attemptKey);
		throw new AppError(
			"We could not verify the code right now. Please try again.",
			503,
			"WHATSAPP_OTP_UNAVAILABLE",
		);
	}
	if (!verified) {
		if (attempts >= MAX_VERIFY_ATTEMPTS) {
			await Redis.del(key, attemptKey, activeKey);
		}
		throw new AppError(
			"Incorrect verification code. Please try again.",
			403,
			"WHATSAPP_OTP_INVALID",
		);
	}

	await Redis.del(key, attemptKey, activeKey);
	return {
		...(await signInWithVerifiedPhone({ phone: challenge.phone, ip })),
		next: cleanAuthNext(challenge.next),
	};
}
