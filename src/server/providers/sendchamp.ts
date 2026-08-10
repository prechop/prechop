import "server-only";
import { randomInt } from "node:crypto";
import axios, { type AxiosInstance } from "axios";
import {
	SENDCHAMP_API_KEY,
	SENDCHAMP_SENDER_ID,
	SENDCHAMP_TIMEOUT_MS,
	SENDCHAMP_WHATSAPP_SENDER,
	SMS_CONSOLE_MODE,
} from "../constants";

const SENDCHAMP_BASE_URL = "https://api.sendchamp.com/api/v1";

export interface VerificationChallenge {
	reference: string;
	/** Only present in the local console provider. */
	devOtp?: string;
}

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
		// Dev-only console sink keeps local order-notification flows from
		// burning SMS credits.
		if (SMS_CONSOLE_MODE) {
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

	async createWhatsAppVerification(
		phone: string,
	): Promise<VerificationChallenge> {
		const recipient = toInternationalFormat(phone);
		if (SMS_CONSOLE_MODE) {
			const otp = randomInt(0, 1_000_000).toString().padStart(6, "0");
			console.log(`[DEV WHATSAPP OTP] To: ${phone} | Code: ${otp}`);
			return { reference: `dev:${otp}`, devOtp: otp };
		}
		if (!SENDCHAMP_API_KEY) {
			throw new Error("Sendchamp verification is not configured.");
		}

		try {
			const response = await this.client.post("/verification/create", {
				channel: "whatsapp",
				token_type: "numeric",
				token_length: 6,
				expiration_time: 5,
				sender: SENDCHAMP_WHATSAPP_SENDER,
				customer_mobile_number: recipient,
				meta_data: { product: "Prechop" },
			});
			const body = response.data as Record<string, any>;
			const reference =
				body?.data?.reference ??
				body?.data?.verification_reference ??
				body?.reference ??
				body?.verification_reference;
			if (typeof reference !== "string" || !reference) {
				throw new Error(
					"Sendchamp did not return a verification reference.",
				);
			}
			return { reference };
		} catch (error) {
			logSendchampError("verification.whatsapp.create", error);
			throw error;
		}
	}

	async confirmWhatsAppVerification(
		reference: string,
		code: string,
	): Promise<boolean> {
		if (reference.startsWith("dev:")) {
			return reference.slice(4) === code;
		}
		try {
			await this.client.post("/verification/confirm", {
				verification_code: code,
				verification_reference: reference,
			});
			return true;
		} catch (error) {
			if (
				axios.isAxiosError(error) &&
				[400, 404, 422].includes(error.response?.status ?? 0)
			) {
				return false;
			}
			logSendchampError("verification.whatsapp.confirm", error);
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
