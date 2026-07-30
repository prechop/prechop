import "server-only";
import { Resend } from "resend";
import { NODE_ENV, RESEND_API_KEY, RESEND_FROM_EMAIL } from "../constants";

const resend = new Resend(RESEND_API_KEY || "re_dev_placeholder");

interface SendReceiptEmailInput {
	to: string;
	buyerName: string;
	orderNumber: string;
	vendorName: string;
	receiptPdfBuffer: Buffer;
}

interface SendAdminAttentionEmailInput {
	to: string[];
	title: string;
	whatHappened: string;
	submittedBy: string;
	occurredAt: Date;
	recordId: string;
	adminUrl: string;
}

interface SendTransactionalEmailInput {
	to: string;
	subject: string;
	preheader?: string;
	title: string;
	body: string;
	actionLabel?: string;
	actionUrl?: string;
	rows?: Array<[string, string | number | undefined | null]>;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

async function safeSend(fn: () => Promise<unknown>): Promise<boolean> {
	// Email must never break a request path. In dev we skip real sends.
	if (NODE_ENV !== "production") return false;
	try {
		await fn();
		return true;
	} catch (error) {
		console.error("[resend] email send failed:", error);
		return false;
	}
}

function tableRows(
	rows: Array<[string, string | number | undefined | null]> = [],
): string {
	return rows
		.filter(
			([, value]) =>
				value !== undefined && value !== null && value !== "",
		)
		.map(
			([label, value]) =>
				`<tr><td style="padding:8px 12px;color:#6b5b4b;font-weight:700">${escapeHtml(label)}</td><td style="padding:8px 12px">${escapeHtml(String(value))}</td></tr>`,
		)
		.join("");
}

class ResendProvider {
	async sendSignInLink(to: string, signInUrl: string): Promise<void> {
		await safeSend(() =>
			resend.emails.send({
				from: RESEND_FROM_EMAIL,
				to,
				subject: "Continue to Prechop",
				html: `<p>Use this secure link to continue to Prechop:</p><p><a href="${signInUrl}">Continue to Prechop</a></p><p>This link expires in 1 hour. If you did not request it, you can ignore this email.</p>`,
			}),
		);
	}

	async sendReceiptEmail(input: SendReceiptEmailInput): Promise<void> {
		await safeSend(() =>
			resend.emails.send({
				from: RESEND_FROM_EMAIL,
				to: input.to,
				subject: `Your PreChop receipt — Order ${input.orderNumber}`,
				html: `<p>Hi ${input.buyerName},</p><p>Thanks for ordering from ${input.vendorName} on PreChop. Your receipt for order <strong>${input.orderNumber}</strong> is attached.</p><p>— The PreChop Team</p>`,
				attachments: [
					{
						filename: `receipt-${input.orderNumber}.pdf`,
						content: input.receiptPdfBuffer,
					},
				],
			}),
		);
	}

	async sendVendorWelcome(to: string, businessName: string): Promise<void> {
		await safeSend(() =>
			resend.emails.send({
				from: RESEND_FROM_EMAIL,
				to,
				subject: "Welcome to PreChop!",
				html: `<p>Hi ${businessName},</p><p>Your vendor account is set up. Complete your profile to start receiving orders.</p><p>— The PreChop Team</p>`,
			}),
		);
	}

	async sendVendorSuspended(
		to: string,
		businessName: string,
		reason: string,
	): Promise<void> {
		await safeSend(() =>
			resend.emails.send({
				from: RESEND_FROM_EMAIL,
				to,
				subject: "Your PreChop vendor account has been suspended",
				html: `<p>Hi ${businessName},</p><p>Your vendor account on PreChop has been suspended.</p><p><strong>Reason:</strong> ${reason}</p><p>If you believe this is a mistake, please contact PreChop support.</p>`,
			}),
		);
	}

	async sendVendorSubmissionReceived(
		to: string,
		businessName: string,
	): Promise<void> {
		await safeSend(() =>
			resend.emails.send({
				from: RESEND_FROM_EMAIL,
				to,
				subject: "We've received your PreChop vendor application",
				html: `<p>Hi ${businessName},</p><p>Thanks for submitting your vendor application. Our team will review your details and get back to you shortly. You'll be able to go live once approved.</p><p>— The PreChop Team</p>`,
			}),
		);
	}

	async sendVendorApproved(to: string, businessName: string): Promise<void> {
		await safeSend(() =>
			resend.emails.send({
				from: RESEND_FROM_EMAIL,
				to,
				subject: "You're approved — welcome to PreChop! 🎉",
				html: `<p>Hi ${businessName},</p><p>Great news — your vendor application has been approved and your storefront is now live. Open your dashboard to start taking orders.</p><p>— The PreChop Team</p>`,
			}),
		);
	}

	async sendVendorChangesRequested(
		to: string,
		businessName: string,
		reason: string,
	): Promise<void> {
		await safeSend(() =>
			resend.emails.send({
				from: RESEND_FROM_EMAIL,
				to,
				subject: "Action needed on your PreChop vendor application",
				html: `<p>Hi ${businessName},</p><p>We reviewed your application and need a few changes before we can approve it.</p><p><strong>What to fix:</strong> ${reason}</p><p>Update your profile and resubmit — we'll take another look right away.</p><p>— The PreChop Team</p>`,
			}),
		);
	}

	async sendAdminAttentionEmail(
		input: SendAdminAttentionEmailInput,
	): Promise<void> {
		if (input.to.length === 0) return;
		const rows = [
			["What happened", input.whatHappened],
			["Submitted by", input.submittedBy],
			["When", input.occurredAt.toISOString()],
			["Reference", input.recordId],
		]
			.map(
				([label, value]) =>
					`<tr><td style="padding:8px 12px;color:#6b5b4b;font-weight:700">${escapeHtml(label)}</td><td style="padding:8px 12px">${escapeHtml(value)}</td></tr>`,
			)
			.join("");
		await safeSend(() =>
			resend.emails.send({
				from: RESEND_FROM_EMAIL,
				to: input.to,
				subject: `Admin attention needed: ${input.title}`,
				html: `<p>An item needs admin review in PreChop.</p><table style="border-collapse:collapse;border:1px solid #eadfd4">${rows}</table><p><a href="${escapeHtml(input.adminUrl)}">Open this item in admin</a></p><p>Only action-worthy admin events are sent here to keep this inbox useful.</p>`,
			}),
		);
	}

	async sendTransactionalEmail(
		input: SendTransactionalEmailInput,
	): Promise<boolean> {
		const rows = tableRows(input.rows);
		const action =
			input.actionUrl && input.actionLabel
				? `<p><a href="${escapeHtml(input.actionUrl)}" style="display:inline-block;padding:12px 16px;border-radius:8px;background:#ff5a1f;color:#fff;text-decoration:none;font-weight:700">${escapeHtml(input.actionLabel)}</a></p>`
				: "";
		return safeSend(() =>
			resend.emails.send({
				from: RESEND_FROM_EMAIL,
				to: input.to,
				subject: input.subject,
				html: `<p style="display:none">${escapeHtml(input.preheader ?? input.subject)}</p><h2>${escapeHtml(input.title)}</h2><p>${escapeHtml(input.body)}</p>${rows ? `<table style="border-collapse:collapse;border:1px solid #eadfd4">${rows}</table>` : ""}${action}<p>— The PreChop Team</p>`,
			}),
		);
	}
}

export const resendProvider = new ResendProvider();
