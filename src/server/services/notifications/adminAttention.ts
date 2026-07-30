import {
	ADMIN_ATTENTION_EMAILS,
	ADMINISTRATORS_GROUP,
	APP_URL,
} from "@/server/constants";
import { acquireLock } from "@/server/databases";
import { getGroupByNameDB, listUsersDB } from "@/server/models";
import { resendProvider } from "@/server/providers";
import { createUserNotification } from "./createUserNotification";

const DEDUPE_SECONDS = 7 * 24 * 60 * 60;

export type AdminAttentionKind =
	| "VENDOR_APPLICATION"
	| "VENDOR_APPLICATION_RESUBMISSION"
	| "SUPPORT_REQUEST"
	| "REPORTED_REVIEW"
	| "REFUND_REVIEW"
	| "DISPUTE"
	| "PAYMENT_ISSUE"
	| "VENDOR_BANK_CHANGE"
	| "SUSPICIOUS_ACTIVITY"
	| "SYSTEM_MANUAL_REVIEW";

export type AdminAttentionSeverity = "info" | "warning" | "critical";

export interface AdminAttentionInput {
	kind: AdminAttentionKind;
	title: string;
	whatHappened: string;
	submittedBy: string;
	recordId: string;
	adminPath: string;
	occurredAt?: Date;
	dedupeKey: string;
	severity?: AdminAttentionSeverity;
	category?: string;
	reason?: {
		code?: string;
		explanation?: string;
	};
	references?: {
		orderId?: string;
		orderNumber?: string;
		vendorId?: string;
		buyerId?: string;
		supportRequestId?: string;
		refundId?: string;
		paymentId?: string;
	};
	actionLabel?: string;
	email?: boolean;
}

function absoluteAdminUrl(path: string): string {
	const cleanPath = path.startsWith("/") ? path : `/${path}`;
	return new URL(cleanPath, APP_URL.replace(/\/$/, "")).toString();
}

function defaultActionLabel(kind: AdminAttentionKind) {
	if (kind === "VENDOR_APPLICATION" || kind === "VENDOR_APPLICATION_RESUBMISSION") {
		return "Open application";
	}
	if (kind === "SUPPORT_REQUEST") return "Open support conversation";
	if (kind === "REFUND_REVIEW") return "Review refund";
	if (kind === "DISPUTE") return "View dispute";
	if (kind === "VENDOR_BANK_CHANGE") return "Review vendor";
	return "View details";
}

async function listAdministratorUserIds(): Promise<string[]> {
	const adminGroup = await getGroupByNameDB({ name: ADMINISTRATORS_GROUP });
	const adminGroupId = adminGroup?._id?.toString() ?? adminGroup?.id;
	if (!adminGroupId) return [];

	const pageSize = 100;
	let skip = 0;
	const ids: string[] = [];
	for (;;) {
		const { users } = await listUsersDB({
			groupId: adminGroupId,
			skip,
			limit: pageSize,
		});
		ids.push(...users.map((user) => user._id.toString()));
		if (users.length < pageSize) break;
		skip += pageSize;
	}
	return ids;
}

async function notifyAdminsInApp(input: AdminAttentionInput): Promise<void> {
	const adminUserIds = await listAdministratorUserIds();
	if (adminUserIds.length === 0) return;
	const occurredAt = input.occurredAt ?? new Date();
	await Promise.all(
		adminUserIds.map((userId) =>
			createUserNotification({
				userId,
				title: input.title,
				body: input.whatHappened,
				type: "ADMIN_ATTENTION",
				dedupeKey: `admin:${input.dedupeKey}`,
				data: {
					kind: input.kind,
					category: input.category ?? input.kind,
					severity: input.severity ?? "warning",
					explanation: input.whatHappened,
					submittedBy: input.submittedBy,
					recordId: input.recordId,
					adminPath: input.adminPath,
					actionLabel:
						input.actionLabel ?? defaultActionLabel(input.kind),
					occurredAt: occurredAt.toISOString(),
					reason: input.reason,
					references: input.references,
				},
			}),
		),
	);
}

export async function notifyAdminAttention(
	input: AdminAttentionInput,
): Promise<void> {
	try {
		await notifyAdminsInApp(input);
		if (input.email === false || ADMIN_ATTENTION_EMAILS.length === 0) {
			return;
		}
		const locked = await acquireLock(
			`admin-attention:${input.dedupeKey}`,
			new Date().toISOString(),
			DEDUPE_SECONDS,
		);
		if (!locked) return;
		await resendProvider.sendAdminAttentionEmail({
			to: ADMIN_ATTENTION_EMAILS,
			title: input.title,
			whatHappened: input.whatHappened,
			submittedBy: input.submittedBy,
			occurredAt: input.occurredAt ?? new Date(),
			recordId: input.recordId,
			adminUrl: absoluteAdminUrl(input.adminPath),
		});
	} catch (error) {
		console.error("[admin-attention] email notification failed:", error);
	}
}
