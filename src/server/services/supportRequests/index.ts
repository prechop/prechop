import {
	ErrForbidden,
	ErrInvalidAction,
	ErrOrderNotFound,
} from "../../constants";
import type { AuthResult } from "../../lib";
import {
	addSupportMessageDB,
	createSupportRequestDB,
	getBuyerOrderByNumberDB,
	getSupportRequestByIdDB,
	getVendorProfileByIdDB,
	type ISupportRequestCreateInput,
	listSupportRequestsByUserDB,
	listSupportRequestsDB,
	type SupportAudience,
	type SupportStatus,
	updateSupportRequestDB,
} from "../../models";
import { createUserNotification } from "../notifications";

function roleFromAuth(auth: AuthResult): SupportAudience {
	if (
		auth.groups.includes("Administrators") ||
		auth.permissions.includes("*")
	) {
		return "ADMIN";
	}
	if (auth.groups.includes("Vendors")) return "VENDOR";
	return "BUYER";
}

export function listMySupportRequests({ userId }: { userId: string }) {
	return listSupportRequestsByUserDB({ userId });
}

export async function createSupportRequest({
	auth,
	payload,
}: {
	auth: AuthResult;
	payload: Omit<ISupportRequestCreateInput, "userId" | "senderRole">;
}) {
	const request = await createSupportRequestDB({
		payload: {
			userId: auth.userId,
			senderRole: roleFromAuth(auth),
			category: payload.category,
			subject: payload.subject,
			message: payload.message,
			relatedOrderRef: payload.relatedOrderRef,
			relatedPaymentRef: payload.relatedPaymentRef,
		},
	});
	if (!request) throw ErrInvalidAction;
	await notifyVendorOfOrderSupportRequest(request);
	return request;
}

async function notifyVendorOfOrderSupportRequest(request: {
	_id: string;
	userId: { toString(): string };
	senderRole: SupportAudience;
	relatedOrderRef?: string;
	subject: string;
}) {
	if (request.senderRole !== "BUYER" || !request.relatedOrderRef) return;
	try {
		const order = await getBuyerOrderByNumberDB({
			orderNumber: request.relatedOrderRef,
		});
		if (!order || order.buyerId.toString() !== request.userId.toString()) {
			return;
		}
		const vendor = await getVendorProfileByIdDB({
			id: order.vendorId.toString(),
		});
		if (!vendor?.userId) return;
		await createUserNotification({
			userId: vendor.userId.toString(),
			title: "Buyer reported an order problem",
			body: `A buyer submitted a support request for order ${order.orderNumber}.`,
			type: "ORDER_SUPPORT_REQUEST",
			dedupeKey: `support:${request._id.toString()}:vendor`,
			data: {
				supportRequestId: request._id.toString(),
				orderId: order._id.toString(),
				orderNumber: order.orderNumber,
			},
		});
	} catch (error) {
		console.error(
			`[support] vendor order-problem notification failed supportRequest=${request._id.toString()} orderRef=${request.relatedOrderRef}:`,
			error,
		);
	}
}

export async function addUserSupportMessage({
	auth,
	requestId,
	message,
}: {
	auth: AuthResult;
	requestId: string;
	message: string;
}) {
	const current = await getSupportRequestByIdDB({ id: requestId });
	if (!current) throw ErrOrderNotFound;
	if (current.userId.toString() !== auth.userId) throw ErrForbidden;
	const updated = await addSupportMessageDB({
		id: requestId,
		senderId: auth.userId,
		senderRole: roleFromAuth(auth),
		body: message,
		nextStatus: "OPEN",
	});
	if (!updated) throw ErrInvalidAction;
	return updated;
}

export function listAdminSupportRequests({
	status,
}: {
	status?: SupportStatus;
}) {
	return listSupportRequestsDB({ status });
}

export async function updateAdminSupportRequest({
	requestId,
	status,
	assignedAdminId,
}: {
	requestId: string;
	status?: SupportStatus;
	assignedAdminId?: string;
}) {
	const updated = await updateSupportRequestDB({
		id: requestId,
		status,
		assignedAdminId,
	});
	if (!updated) throw ErrOrderNotFound;
	return updated;
}

export async function addAdminSupportMessage({
	adminUserId,
	requestId,
	message,
}: {
	adminUserId: string;
	requestId: string;
	message: string;
}) {
	const current = await getSupportRequestByIdDB({ id: requestId });
	if (!current) throw ErrOrderNotFound;
	const updated = await addSupportMessageDB({
		id: requestId,
		senderId: adminUserId,
		senderRole: "ADMIN",
		body: message,
		nextStatus: "PENDING_USER",
	});
	if (!updated) throw ErrInvalidAction;
	await createUserNotification({
		userId: current.userId.toString(),
		title: "Support replied",
		body: `Reply on: ${current.subject}`,
		type: "SUPPORT_REPLY",
		data: { supportRequestId: requestId },
	});
	return updated;
}
