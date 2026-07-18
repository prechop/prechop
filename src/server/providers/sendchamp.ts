import "server-only";
import axios, { type AxiosInstance } from "axios";
import {
	OTP_CONSOLE_MODE,
	SENDCHAMP_API_KEY,
	SENDCHAMP_SENDER_ID,
	SENDCHAMP_TIMEOUT_MS,
} from "../constants";

const SENDCHAMP_BASE_URL = "https://api.sendchamp.com/api/v1";

function toInternationalFormat(localPhone: string): string {
	const digits = localPhone.replace(/\D/g, "");
	// 08012345678 -> 2348012345678, +2348012345678 -> 2348012345678
	return digits.replace(/^0/, "234");
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
			await this.client.post("/verification/create", {
				channel: "sms",
				sender: SENDCHAMP_SENDER_ID,
				token_type: "numeric",
				token_length: otp.length,
				expiration_time: 10,
				customer_mobile_number: toInternationalFormat(phone),
				token: otp,
				meta_data: {
					token: otp,
				},
			});
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
