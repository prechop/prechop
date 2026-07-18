import "server-only";
import axios, { type AxiosInstance } from "axios";
import {
	OTP_CONSOLE_MODE,
	SENDCHAMP_API_KEY,
	SENDCHAMP_OTP_CHANNEL,
	SENDCHAMP_OTP_SENDER_ID,
	SENDCHAMP_SENDER_ID,
	SENDCHAMP_TIMEOUT_MS,
} from "../constants";

const SENDCHAMP_BASE_URL = "https://api.sendchamp.com/api/v1";

type SendchampOtpPayload = {
	channel: string;
	sender?: string;
	token_type: "numeric";
	token_length: number;
	expiration_time: number;
	customer_mobile_number: string;
	meta_data: {
		token: string;
	};
};

function toInternationalFormat(localPhone: string): string {
	const digits = localPhone.replace(/\D/g, "");
	// 08012345678 -> 2348012345678, +2348012345678 -> 2348012345678
	return digits.replace(/^0/, "234");
}

function normalizeOtpChannel(channel: string): string {
	const value = channel.trim().toLowerCase();
	if (value === "whatsapp") return "whatsapp";
	if (value === "voice") return "voice";
	if (value === "email") return "email";
	return "sms";
}

function documentedOtpChannel(channel: string): string {
	const value = normalizeOtpChannel(channel);
	if (value === "whatsapp") return "WhatsApp";
	if (value === "voice") return "Voice";
	if (value === "email") return "Email";
	return "SMS";
}

function logSendchampError(context: string, error: unknown): void {
	if (axios.isAxiosError(error)) {
		console.error("Sendchamp request failed:", {
			context,
			status: error.response?.status,
			code: error.code,
			response: error.response?.data,
		});
		return;
	}
	console.error("Sendchamp request failed:", { context, error });
}

class SendchampProvider {
	private client: AxiosInstance;

	constructor() {
		this.client = axios.create({
			baseURL: SENDCHAMP_BASE_URL,
			timeout: SENDCHAMP_TIMEOUT_MS,
			headers: {
				Authorization: `Bearer ${SENDCHAMP_API_KEY}`,
				"Content-Type": "application/json",
				Accept: "application/json",
			},
		});
	}

	private async send(to: string, message: string): Promise<void> {
		// Dev-only console sink — keeps local flows free and avoids burning SMS
		// credits. `OTP_CONSOLE_MODE` is false whenever IS_PROD, so this branch
		// is unreachable in production for every possible env-var combination.
		if (OTP_CONSOLE_MODE) {
			console.log(`[DEV SMS] To: ${to} | ${message}`);
			return;
		}
		try {
			await this.client.post("/sms/send", {
				to: toInternationalFormat(to),
				message,
				sender_name: SENDCHAMP_SENDER_ID,
				route: "dnd",
			});
		} catch (error) {
			logSendchampError("sms.send", error);
			throw error;
		}
	}

	async sendOtp(phone: string, otp: string): Promise<void> {
		// Auth OTPs use Sendchamp's Verification product. Plain `/sms/send`
		// accepts the request but can fail at DLR for some routes; Verification is
		// the channel that reliably delivered in Sendchamp testing.
		if (OTP_CONSOLE_MODE) {
			console.log(`[DEV OTP] To: ${phone} | ${otp}`);
			return;
		}

		try {
			const channel = normalizeOtpChannel(SENDCHAMP_OTP_CHANNEL);
			const payload: SendchampOtpPayload = {
				channel,
				token_type: "numeric",
				token_length: otp.length,
				expiration_time: 10,
				customer_mobile_number: toInternationalFormat(phone),
				meta_data: {
					token: otp,
				},
			};
			if (SENDCHAMP_OTP_SENDER_ID.trim()) {
				payload.sender = SENDCHAMP_OTP_SENDER_ID.trim();
			}
			try {
				await this.client.post("/verification/create", payload);
			} catch (error) {
				if (
					!axios.isAxiosError(error) ||
					error.response?.status !== 400
				) {
					throw error;
				}
				// Some Sendchamp dashboard examples display title-case channels
				// even though API requests may accept lowercase. Retry the same OTP
				// once with the documented casing before surfacing the provider
				// rejection.
				const documentedChannel = documentedOtpChannel(
					SENDCHAMP_OTP_CHANNEL,
				);
				if (payload.channel === documentedChannel) throw error;
				await this.client.post("/verification/create", {
					...payload,
					channel: documentedChannel,
				});
			}
		} catch (error) {
			logSendchampError("verification.create", error);
			throw error;
		}
	}

	async sendOrderConfirmation(
		phone: string,
		orderNumber: string,
		vendorName: string,
	): Promise<void> {
		await this.send(
			phone,
			`PreChop: Your order ${orderNumber} from ${vendorName} is confirmed! We'll text you when it's ready.`,
		);
	}

	async sendOrderReady(phone: string, orderNumber: string): Promise<void> {
		await this.send(
			phone,
			`PreChop: Your order ${orderNumber} is ready! Come collect it.`,
		);
	}

	async sendVendorNewOrder(
		phone: string,
		orderNumber: string,
		totalNaira: number,
	): Promise<void> {
		await this.send(
			phone,
			`PreChop: New order ${orderNumber}! Total: NGN${totalNaira.toLocaleString()}. Check your dashboard.`,
		);
	}

	async sendOrderCancelled(
		phone: string,
		orderNumber: string,
		refundNote: string,
	): Promise<void> {
		await this.send(
			phone,
			`PreChop: Order ${orderNumber} was cancelled. ${refundNote}`,
		);
	}

	async sendCustom(phone: string, message: string): Promise<void> {
		await this.send(phone, message);
	}
}

export const sendchampProvider = new SendchampProvider();
