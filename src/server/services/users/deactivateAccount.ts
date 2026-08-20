import {
	AppError,
	ErrTryAgain,
	normalizeNigerianMobilePhone,
	tryDecrypt,
} from "../../constants";
import {
	deactivateUserAccountDB,
	getUserByIdWithPhoneDB,
	getVendorProfileByUserIdDB,
} from "../../models";
import {
	describeAccountObligations,
	getAccountObligations,
} from "../accountObligations";
import { recordAudit } from "../audit";
import {
	CLOSE_VENDOR_CONFIRMATION,
	closeVendorProfile,
} from "../vendors/closeProfile";

export const DELETE_ACCOUNT_CONFIRMATION = "DELETE MY PRECHOP ACCOUNT";
const MAX_REAUTH_AGE_MS = 10 * 60 * 1000;

/** Soft-deactivate the authenticated user's account. */
export async function deactivateAccount({
	userId,
	accountIdentifier,
	confirmation,
	authenticatedAt,
	securityPin,
}: {
	userId: string;
	accountIdentifier: string;
	confirmation: string;
	authenticatedAt: Date;
	securityPin?: string;
}): Promise<{ success: boolean }> {
	const user = await getUserByIdWithPhoneDB({ id: userId });
	if (!user) throw ErrTryAgain;
	if (confirmation !== DELETE_ACCOUNT_CONFIRMATION) {
		throw new AppError(
			`Type ${DELETE_ACCOUNT_CONFIRMATION} to confirm.`,
			400,
			"DELETE_ACCOUNT_CONFIRMATION_REQUIRED",
		);
	}
	const identifier = accountIdentifier.trim();
	const phone = user.phone ? tryDecrypt(user.phone) : undefined;
	const emailMatches =
		!user.email.endsWith("@auth.prechop.local") &&
		identifier.toLowerCase() === user.email.trim().toLowerCase();
	const phoneMatches =
		!!phone &&
		normalizeNigerianMobilePhone(identifier) ===
			normalizeNigerianMobilePhone(phone);
	if (!emailMatches && !phoneMatches) {
		throw new AppError(
			"Enter the email or verified phone number on this account to confirm deletion.",
			403,
			"DELETE_ACCOUNT_IDENTIFIER_MISMATCH",
		);
	}
	const authTime = authenticatedAt.getTime();
	if (
		!Number.isFinite(authTime) ||
		Date.now() - authTime > MAX_REAUTH_AGE_MS ||
		authTime > Date.now() + 60_000
	) {
		throw new AppError(
			"For your security, sign in again before deleting your account.",
			401,
			"RECENT_AUTHENTICATION_REQUIRED",
		);
	}

	const vendor = await getVendorProfileByUserIdDB({ userId });
	const vendorId = vendor ? String(vendor.id ?? vendor._id) : undefined;
	const obligations = await getAccountObligations({
		buyerId: userId,
		vendorId,
	});
	if (obligations.hasOutstandingObligations) {
		throw new AppError(
			`Resolve these account obligations first: ${describeAccountObligations(obligations)}.`,
			409,
			"ACCOUNT_DELETION_BLOCKED",
		);
	}

	if (vendor) {
		await closeVendorProfile({
			userId,
			confirmation: CLOSE_VENDOR_CONFIRMATION,
			securityPin,
		});
	}

	const success = await deactivateUserAccountDB({ id: userId });
	if (!success) throw ErrTryAgain;
	recordAudit({
		userId,
		action: "USER_ACCOUNT_DEACTIVATE",
		resourceType: "users",
		resourceId: userId,
		newState: { isActive: false, refreshTokensRevoked: true },
	});
	return { success: true };
}
