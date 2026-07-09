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

async function safeSend(fn: () => Promise<unknown>): Promise<void> {
	// Email must never break a request path. In dev we skip real sends.
	if (NODE_ENV !== "production") return;
	try {
		await fn();
	} catch (error) {
		console.error("[resend] email send failed:", error);
	}
}

class ResendProvider {
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
}

export const resendProvider = new ResendProvider();
