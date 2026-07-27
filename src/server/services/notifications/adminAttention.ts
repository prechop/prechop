import { ADMIN_ATTENTION_EMAILS, APP_URL } from "@/server/constants";
import { acquireLock } from "@/server/databases";
import { resendProvider } from "@/server/providers";

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

export interface AdminAttentionInput {
	kind: AdminAttentionKind;
	title: string;
	whatHappened: string;
	submittedBy: string;
	recordId: string;
	adminPath: string;
	occurredAt?: Date;
	dedupeKey: string;
}

function absoluteAdminUrl(path: string): string {
	const cleanPath = path.startsWith("/") ? path : `/${path}`;
	return new URL(cleanPath, APP_URL.replace(/\/$/, "")).toString();
}

export async function notifyAdminAttention(
	input: AdminAttentionInput,
): Promise<void> {
	try {
		if (ADMIN_ATTENTION_EMAILS.length === 0) return;
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
