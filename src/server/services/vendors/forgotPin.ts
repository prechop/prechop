import bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";
import { Redis } from "@/server/databases";
import {
	ErrPinResetHoldActive,
	ErrPinResetOtpExpired,
	ErrPinResetOtpInvalid,
	ErrPinResetRateLimited,
	ErrPinResetSupportRequired,
	ErrPinResetUnauthorized,
	ErrVendorNotFound,
	hash,
	validationError,
} from "@/server/constants";
import {
	getVendorProfileByIdDB,
	updateVendorProfileDB,
} from "@/server/models";
import { recordAudit } from "@/server/services/audit";
import { createUserNotification, notifyAdminAttention } from "@/server/services/notifications";
import { createSupportRequest } from "@/server/services/supportRequests";
import { resendProvider } from "@/server/providers";
import { resolveVendorByUserId, vendorIdOf } from "./resolveVendor";
import { verifyVendorSecurityPinForSensitiveAction } from "./securityOnboarding";

const PIN_RESET_TTL_SECONDS = 10 * 60;
const PIN_RESET_RATE_LIMIT_WINDOW = 60 * 60;
const PIN_RESET_RATE_LIMIT_MAX = 5;
const PIN_RESET_VERIFY_RATE_LIMIT_MAX = 10;
const PIN_RESET_OTP_LENGTH = 6;
const PIN_RESET_HOLD_HOURS = 24;

type PinResetSession = {
	vendorId: string;
	email: string;
	ip?: string;
	userAgent?: string;
	attempts: number;
	createdAt: number;
};

type PinResetOtpRecord = PinResetSession & {
	otpHash: string;
};

function requestKey(vendorId: string): string {
	return `vendor:pin-reset:request:${vendorId}`;
}

function otpKey(otpHash: string): string {
	return `vendor:pin-reset:otp:${otpHash}`;
}

function rateLimitKey(ip: string): string {
	return `vendor:pin-reset:rate:${hash(ip)}`;
}

function verifyRateLimitKey(ip: string): string {
	return `vendor:pin-reset:verify:rate:${hash(ip)}`;
}

export function generateOtp(): string {
	return randomBytes(PIN_RESET_OTP_LENGTH).toString("hex").slice(0, PIN_RESET_OTP_LENGTH);
}

export async function hashOtp(otp: string): Promise<string> {
	return bcrypt.hash(otp, 10);
}

export async function requestPinReset({
	userId,
	email,
	ip,
	userAgent,
}: {
	userId: string;
	email: string;
	ip?: string;
	userAgent?: string;
}): Promise<{ message: string }> {
	const vendor = await resolveVendorByUserId({ userId });
	if (!vendor || vendor.email !== email) {
		throw ErrPinResetUnauthorized;
	}

	const rateKey = rateLimitKey(ip ?? "unknown");
	const current = await Redis.incr(rateKey);
	if (current === 1) {
		await Redis.expire(rateKey, PIN_RESET_RATE_LIMIT_WINDOW);
	}
	if (current > PIN_RESET_RATE_LIMIT_MAX) {
		throw ErrPinResetRateLimited;
	}

	const existingRequestRaw = await Redis.get(requestKey(vendorIdOf(vendor)));
	if (existingRequestRaw) {
		const existing = JSON.parse(existingRequestRaw) as PinResetSession;
		if (Date.now() - existing.createdAt < PIN_RESET_TTL_SECONDS * 1000) {
			throw ErrPinResetRateLimited;
		}
		await Redis.del(requestKey(vendorIdOf(vendor)));
	}

	const otp = generateOtp();
	const otpHash = await hashOtp(otp);
	const session: PinResetOtpRecord = {
		vendorId: vendorIdOf(vendor),
		email: vendor.email,
		ip,
		userAgent,
		attempts: 0,
		createdAt: Date.now(),
		otpHash,
	};

	await Redis.setex(
		otpKey(otpHash),
		PIN_RESET_TTL_SECONDS,
		JSON.stringify(session),
	);
	await Redis.setex(
		requestKey(vendorIdOf(vendor)),
		PIN_RESET_TTL_SECONDS,
		JSON.stringify({
			vendorId: vendorIdOf(vendor),
			email: vendor.email,
			ip,
			userAgent,
			attempts: 0,
			createdAt: Date.now(),
		}),
	);

	const resetUrl = `${process.env.APP_URL?.replace(/\/$/, "") ?? ""}/vendor/settings?pinResetOtp=${encodeURIComponent(otp)}`;
	await resendProvider.sendTransactionalEmail({
		to: vendor.email,
		subject: "Reset your PreChop security PIN",
		title: "Reset your security PIN",
		body:
			"Use the verification code below to reset your PreChop security PIN. This code expires in 10 minutes.",
		preheader: "Your PIN reset code is valid for 10 minutes.",
		actionLabel: "Reset PIN",
		actionUrl: resetUrl,
		rows: [["Verification code", otp]],
	});

	recordAudit({
		userId,
		role: "Vendor",
		action: "VENDOR_PIN_RESET_REQUESTED",
		resourceType: "vendorProfiles",
		resourceId: vendorIdOf(vendor),
		ipAddress: ip,
		userAgent,
	});

	return {
		message: "Verification code sent to your email.",
		...(process.env.NODE_ENV !== "production" ? { devOtp: otp } : {}),
	};
}

export async function verifyPinResetOtp({
	userId,
	email,
	otp,
	ip,
	userAgent,
}: {
	userId: string;
	email: string;
	otp: string;
	ip?: string;
	userAgent?: string;
}): Promise<{ verified: boolean; resetToken?: string }> {
	const vendor = await resolveVendorByUserId({ userId });
	if (!vendor || vendor.email !== email) {
		throw ErrPinResetUnauthorized;
	}

	const rateKey = verifyRateLimitKey(ip ?? "unknown");
	const current = await Redis.incr(rateKey);
	if (current === 1) {
		await Redis.expire(rateKey, PIN_RESET_RATE_LIMIT_WINDOW);
	}
	if (current > PIN_RESET_VERIFY_RATE_LIMIT_MAX) {
		throw ErrPinResetRateLimited;
	}

	const requestRaw = await Redis.get(requestKey(vendorIdOf(vendor)));
	if (!requestRaw) {
		throw ErrPinResetOtpExpired;
	}

	const request = JSON.parse(requestRaw) as PinResetSession;
	request.attempts += 1;
	await Redis.setex(
		requestKey(vendorIdOf(vendor)),
		Math.max(1, Math.floor((PIN_RESET_TTL_SECONDS * 1000 - (Date.now() - request.createdAt)) / 1000)),
		JSON.stringify(request),
	);

	let matchedOtpKey: string | null = null;
	let matchedSession: PinResetOtpRecord | null = null;

	const pattern = `vendor:pin-reset:otp:*`;
	const keys = await Redis.keys(pattern);
	for (const key of keys) {
		const raw = await Redis.get(key);
		if (!raw) continue;
		const session = JSON.parse(raw) as PinResetOtpRecord;
		if (session.vendorId !== vendorIdOf(vendor)) continue;
		const ok = await bcrypt.compare(otp, session.otpHash);
		if (ok) {
			matchedOtpKey = key;
			matchedSession = session;
			break;
		}
	}

	if (!matchedOtpKey || !matchedSession) {
		throw ErrPinResetOtpInvalid;
	}

	await Redis.del(matchedOtpKey);
	await Redis.del(requestKey(vendorIdOf(vendor)));

	const resetToken = randomBytes(32).toString("base64url");
	const resetTokenHash = hash(resetToken);
	await Redis.setex(
		`vendor:pin-reset:token:${resetTokenHash}`,
		PIN_RESET_TTL_SECONDS,
		JSON.stringify({
			vendorId: vendorIdOf(vendor),
			email: vendor.email,
			ip,
			userAgent,
			createdAt: Date.now(),
		}),
	);

	recordAudit({
		userId,
		role: "Vendor",
		action: "VENDOR_PIN_RESET_OTP_VERIFIED",
		resourceType: "vendorProfiles",
		resourceId: vendorIdOf(vendor),
		ipAddress: ip,
		userAgent,
	});

	return { verified: true, resetToken };
}

export async function resetPinWithResetToken({
	resetToken,
	newPin,
	ip,
	userAgent,
}: {
	resetToken: string;
	newPin: string;
	ip?: string;
	userAgent?: string;
}): Promise<{ success: boolean }> {
	if (!/^\d{4,6}$/.test(newPin.trim())) {
		throw validationError("PIN must be 4-6 digits.");
	}

	const resetTokenHash = hash(resetToken);
	const key = `vendor:pin-reset:token:${resetTokenHash}`;
	const raw = await Redis.get(key);
	if (!raw) {
		throw ErrPinResetOtpExpired;
	}

	const session = JSON.parse(raw) as { vendorId: string; email: string; ip?: string; userAgent?: string; createdAt: number };
	await Redis.del(key);

	const vendor = await getVendorProfileByIdDB({ id: session.vendorId });
	if (!vendor) throw ErrVendorNotFound;
	if (vendor.email !== session.email) {
		throw ErrPinResetUnauthorized;
	}

	const holdUntil = new Date(Date.now() + PIN_RESET_HOLD_HOURS * 60 * 60 * 1000);
	const newPinHash = await bcrypt.hash(newPin.trim(), 12);

	const updated = await updateVendorProfileDB({
		id: session.vendorId,
		payload: {
			securityPinHash: newPinHash,
			securityOnboardingCompletedAt: new Date(),
			pinResetHoldUntil: holdUntil,
			lastPinResetAt: new Date(),
		},
	});

	await invalidateVendorPinSessions(session.vendorId);

	recordAudit({
		userId: vendor.userId,
		role: "Vendor",
		action: "VENDOR_PIN_RESET_COMPLETED",
		resourceType: "vendorProfiles",
		resourceId: session.vendorId,
		previousState: { pinResetHoldUntil: vendor.pinResetHoldUntil, lastPinResetAt: vendor.lastPinResetAt },
		newState: { pinResetHoldUntil: holdUntil, lastPinResetAt: new Date() },
		ipAddress: ip ?? session.ip,
		userAgent: userAgent ?? session.userAgent,
	});

	try {
		await createUserNotification({
			userId: vendor.userId,
			title: "Security PIN reset",
			body: `Your security PIN was reset. A ${PIN_RESET_HOLD_HOURS}-hour security hold is now active for bank details and payouts.`,
			type: "SECURITY_PIN_RESET",
			dedupeKey: `pin-reset:${session.vendorId}:${Date.now()}`,
			data: {
				vendorId: session.vendorId,
				holdUntil: holdUntil.toISOString(),
				resetMethod: "email_otp",
			},
		});
	} catch {
		// notification must not fail the reset
	}

	try {
		await notifyAdminAttention({
			kind: "SUSPICIOUS_ACTIVITY",
			title: "Vendor security PIN reset",
			whatHappened: `Vendor ${vendor.businessName ?? vendor.email} reset their security PIN via email OTP.`,
			submittedBy: `vendor (${vendor.email})`,
			recordId: session.vendorId,
			adminPath: `/admin/vendors?vendorId=${encodeURIComponent(session.vendorId)}`,
			dedupeKey: `vendor-pin-reset:${session.vendorId}:${Date.now().toString().slice(0, 10)}`,
			severity: "warning",
			references: { vendorId: session.vendorId },
		});
	} catch {
		// notification must not fail the reset
	}

	return { success: true };
}

export async function requestAdminPinReset({
	userId,
	reason,
	ip,
	userAgent,
	auth,
}: {
	userId: string;
	reason: string;
	ip?: string;
	userAgent?: string;
	auth: { userId: string; groups: string[] };
}): Promise<{ supportRequestId: string }> {
	const vendor = await resolveVendorByUserId({ userId });
	if (!vendor) throw ErrVendorNotFound;

	const request = await createSupportRequest({
		auth: {
			userId: auth.userId,
			token: {} as never,
			refreshed: false,
			campusId: "",
			isActive: true,
			groups: auth.groups,
			permissions: [],
			statements: [],
		},
		payload: {
			category: "VENDOR_ACCOUNT",
			subject: "Vendor PIN reset request",
			message: `The vendor (${vendor.email}) cannot access their verified email to reset their security PIN. Reason: ${reason}. Admin review and manual identity verification is required.`,
			relatedOrderRef: undefined,
			relatedPaymentRef: undefined,
		},
	});

	recordAudit({
		userId,
		role: "Vendor",
		action: "VENDOR_PIN_RESET_ADMIN_REQUESTED",
		resourceType: "supportRequests",
		resourceId: request._id.toString(),
		ipAddress: ip,
		userAgent,
	});

	return { supportRequestId: request._id.toString() };
}

export async function authorizePinResetByAdmin({
	vendorId,
	newPin,
	adminUserId,
	ip,
	userAgent,
}: {
	vendorId: string;
	newPin: string;
	adminUserId: string;
	ip?: string;
	userAgent?: string;
}): Promise<{ success: boolean }> {
	if (!/^\d{4,6}$/.test(newPin.trim())) {
		throw validationError("PIN must be 4-6 digits.");
	}

	const vendor = await getVendorProfileByIdDB({ id: vendorId });
	if (!vendor) throw ErrVendorNotFound;

	const holdUntil = new Date(Date.now() + PIN_RESET_HOLD_HOURS * 60 * 60 * 1000);
	const newPinHash = await bcrypt.hash(newPin.trim(), 12);

	const updated = await updateVendorProfileDB({
		id: vendorId,
		payload: {
			securityPinHash: newPinHash,
			securityOnboardingCompletedAt: new Date(),
			pinResetHoldUntil: holdUntil,
			lastPinResetAt: new Date(),
		},
	});

	await invalidateVendorPinSessions(vendorId);

	recordAudit({
		userId: adminUserId,
		role: "Administrators",
		action: "VENDOR_PIN_RESET_ADMIN_AUTHORIZED",
		resourceType: "vendorProfiles",
		resourceId: vendorId,
		ipAddress: ip,
		userAgent,
	});

	try {
		await createUserNotification({
			userId: vendor.userId,
			title: "Security PIN reset by support",
			body: `An admin reset your security PIN after identity verification. A ${PIN_RESET_HOLD_HOURS}-hour security hold is now active.`,
			type: "SECURITY_PIN_RESET",
			dedupeKey: `pin-reset-admin:${vendorId}:${Date.now()}`,
			data: {
				vendorId,
				holdUntil: holdUntil.toISOString(),
				resetMethod: "admin_authorized",
			},
		});
	} catch {
		// notification must not fail the reset
	}

	return { success: true };
}

export async function assertPinResetHoldNotActive(vendor: {
	pinResetHoldUntil?: Date;
}): Promise<void> {
	if (!vendor.pinResetHoldUntil) return;
	if (vendor.pinResetHoldUntil > new Date()) {
		throw ErrPinResetHoldActive;
	}
}

export async function invalidateVendorPinSessions(vendorId: string): Promise<void> {
	const pattern = `vendor:pin-reset:*`;
	const keys = await Redis.keys(pattern);
	for (const key of keys) {
		const raw = await Redis.get(key);
		if (!raw) continue;
		try {
			const data = JSON.parse(raw) as { vendorId?: string };
			if (data.vendorId === vendorId) {
				await Redis.del(key);
			}
		} catch {
			// skip malformed entries
		}
	}
}
