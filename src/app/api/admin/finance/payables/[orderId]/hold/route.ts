import { ErrInvalidFields } from "@/server/constants";
import {
	auditRoleLabel,
	getClientIp,
	getUserAgent,
	handleError,
	ok,
	requirePermission,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import {
	getVendorPayableByOrderIdDB,
	releaseVendorPayableHoldDB,
} from "@/server/models";
import { recordAuditSync } from "@/server/services/audit";
import {
	holdVendorPayableForOrder,
	refreshVendorPayableForOrder,
} from "@/server/services/vendorPayouts";

export const runtime = "nodejs";
export const POST = withApiHandler(
	{ route: "/api/admin/finance/payables/[orderId]/hold" },
	withAuth(async ({ req, auth, context }) => {
		try {
			requirePermission(auth, "payout:hold");
			const { orderId } = await (
				context as { params: Promise<{ orderId: string }> }
			).params;
			const body = (await req.json()) as {
				action?: "HOLD" | "RELEASE";
				reasonCode?: string;
				note?: string;
			};
			if (!body.action || !body.note?.trim()) throw ErrInvalidFields;
			const before = await getVendorPayableByOrderIdDB({
				buyerOrderId: orderId,
			});
			if (body.action === "HOLD") {
				await holdVendorPayableForOrder({
					orderId,
					reasonCode: body.reasonCode ?? "ADMIN_OTHER",
					note: body.note.trim(),
					actorId: auth.userId,
				});
			} else {
				await releaseVendorPayableHoldDB({
					buyerOrderId: orderId,
					releasedBy: auth.userId,
					note: body.note.trim(),
				});
				await refreshVendorPayableForOrder({ orderId });
			}
			const after = await getVendorPayableByOrderIdDB({
				buyerOrderId: orderId,
			});
			await recordAuditSync({
				userId: auth.userId,
				role: auditRoleLabel(auth),
				action:
					body.action === "HOLD"
						? "VENDOR_PAYABLE_HELD"
						: "VENDOR_PAYABLE_RELEASED",
				resourceType: "vendorPayables",
				resourceId: String(after?.id ?? after?._id ?? orderId),
				previousState: before
					? { status: before.status, hold: before.hold }
					: undefined,
				newState: after
					? { status: after.status, hold: after.hold }
					: undefined,
				ipAddress: getClientIp(req),
				userAgent: getUserAgent(req),
			});
			return ok(after);
		} catch (error) {
			return handleError(error);
		}
	}),
);
