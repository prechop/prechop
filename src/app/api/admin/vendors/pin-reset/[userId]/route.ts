import { ErrInvalidFields, ErrVendorNotFound } from "@/server/constants";
import {
	handleError,
	ok,
	requirePermission,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import {
	createPinResetAuthorization,
	getPinResetAuthorization,
	revokePinResetAuthorization,
} from "@/server/services/vendors/forgotPin";
import {
	addAdminSupportMessage,
	updateAdminSupportRequest,
} from "@/server/services/supportRequests";
import { getVendorProfileByUserIdDB } from "@/server/models";
import { vendorIdOf } from "@/server/services/vendors/resolveVendor";
import { createUserNotification, notifyAdminAttention } from "@/server/services/notifications";
import { recordAudit } from "@/server/services/audit";
import { resendProvider } from "@/server/providers";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/admin/vendors/pin-reset/[userId]" },
	withAuth(async ({ req, auth, context }) => {
		try {
			requirePermission(auth, "support:update");
			const { userId } = await (
				context as { params: Promise<{ userId: string }> }
			).params;

			const body = await req.json();
			const action = body.action as string;
			if (!action) throw ErrInvalidFields;

			const vendor = await getVendorProfileByUserIdDB({ userId });
			if (!vendor) throw ErrVendorNotFound;
			const vendorId = vendorIdOf(vendor);

			switch (action) {
				case "approve": {
					const { token } = await createPinResetAuthorization({
						vendorId,
						adminUserId: auth.userId,
					});

					const appUrl =
						process.env.APP_URL?.replace(/\/$/, "") ?? "";
					const resetUrl = `${appUrl}/vendor/settings?pinResetAuth=${encodeURIComponent(token)}`;

					await createUserNotification({
						userId: vendor.userId,
						title: "Identity verified for PIN reset",
						body: "An admin has verified your identity. You may now reset your security PIN.",
						type: "SECURITY_PIN_RESET",
						dedupeKey: `pin-reset-auth:${vendorId}:${Date.now()}`,
						data: {
							vendorId,
							resetMethod: "admin_authorized",
						},
					});

					await resendProvider.sendTransactionalEmail({
						to: vendor.email,
						subject: "Your identity has been verified",
						title: "Identity verified",
						body:
							"An admin has verified your identity. You may now reset your security PIN using the link below.",
						preheader: "Click the button below to reset your security PIN.",
						actionLabel: "Reset PIN",
						actionUrl: resetUrl,
					});

					await notifyAdminAttention({
						kind: "SUSPICIOUS_ACTIVITY",
						title: "Vendor PIN reset approved",
						whatHappened: `Admin approved identity verification for vendor ${vendor.businessName ?? vendor.email} (${vendorId}). A PIN reset authorization was issued.`,
						submittedBy: `admin (${auth.userId})`,
						recordId: vendorId,
						adminPath: `/admin/vendors?vendorId=${encodeURIComponent(vendorId)}`,
						dedupeKey: `vendor-pin-reset-approve:${vendorId}:${Date.now().toString().slice(0, 10)}`,
						severity: "warning",
						references: { vendorId },
					});

					recordAudit({
						userId: auth.userId,
						role: "Administrators",
						action: "VENDOR_PIN_RESET_ADMIN_APPROVED",
						resourceType: "vendorProfiles",
						resourceId: vendorId,
					});

					return ok({ success: true, token });
				}

				case "reject": {
					const reason = (body.reason as string)?.trim();
					const supportRequestId = body.supportRequestId as string | undefined;
					if (!reason || reason.length < 5 || !supportRequestId) {
						throw ErrInvalidFields;
					}

					await updateAdminSupportRequest({
						requestId: supportRequestId,
						status: "CLOSED",
					});

					await addAdminSupportMessage({
						adminUserId: auth.userId,
						requestId: supportRequestId,
						message: `Your PIN reset request has been rejected. Reason: ${reason}`,
					});

					await notifyAdminAttention({
						kind: "SUSPICIOUS_ACTIVITY",
						title: "Vendor PIN reset rejected",
						whatHappened: `Admin rejected PIN reset request for vendor ${vendor.businessName ?? vendor.email} (${vendorId}).`,
						submittedBy: `admin (${auth.userId})`,
						recordId: vendorId,
						adminPath: `/admin/vendors?vendorId=${encodeURIComponent(vendorId)}`,
						dedupeKey: `vendor-pin-reset-reject:${vendorId}:${Date.now().toString().slice(0, 10)}`,
						severity: "info",
						references: { vendorId },
					});

					recordAudit({
						userId: auth.userId,
						role: "Administrators",
						action: "VENDOR_PIN_RESET_ADMIN_REJECTED",
						resourceType: "vendorProfiles",
						resourceId: vendorId,
					});

					return ok({ success: true });
				}

				case "request-info": {
					const message = (body.message as string)?.trim();
					const supportRequestId = body.supportRequestId as string | undefined;
					if (!message || message.length < 5 || !supportRequestId) {
						throw ErrInvalidFields;
					}

					await updateAdminSupportRequest({
						requestId: supportRequestId,
						status: "PENDING_USER",
					});

					await addAdminSupportMessage({
						adminUserId: auth.userId,
						requestId: supportRequestId,
						message: `We need more information to verify your identity: ${message}`,
					});

					recordAudit({
						userId: auth.userId,
						role: "Administrators",
						action: "VENDOR_PIN_RESET_INFO_REQUESTED",
						resourceType: "vendorProfiles",
						resourceId: vendorId,
					});

					return ok({ success: true });
				}

				case "revoke": {
					await revokePinResetAuthorization(vendorId);

					await notifyAdminAttention({
						kind: "SUSPICIOUS_ACTIVITY",
						title: "Vendor PIN reset authorization revoked",
						whatHappened: `Admin revoked PIN reset authorization for vendor ${vendor.businessName ?? vendor.email} (${vendorId}).`,
						submittedBy: `admin (${auth.userId})`,
						recordId: vendorId,
						adminPath: `/admin/vendors?vendorId=${encodeURIComponent(vendorId)}`,
						dedupeKey: `vendor-pin-reset-revoke:${vendorId}:${Date.now().toString().slice(0, 10)}`,
						severity: "warning",
						references: { vendorId },
					});

					recordAudit({
						userId: auth.userId,
						role: "Administrators",
						action: "VENDOR_PIN_RESET_AUTHORIZATION_REVOKED",
						resourceType: "vendorProfiles",
						resourceId: vendorId,
					});

					return ok({ success: true });
				}

				default:
					throw ErrInvalidFields;
			}
		} catch (error) {
			return handleError(error);
		}
	}),
);
