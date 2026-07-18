import "server-only";
import axios, { type AxiosInstance } from "axios";
import {
	OTP_CONSOLE_MODE,
	TERMII_API_KEY,
	TERMII_BASE_URL,
	TERMII_CHANNEL,
	TERMII_SENDER_ID,
	TERMII_TIMEOUT_MS,
} from "../constants";

type TermiiSendTokenResponse = {
	pinId?: string;
	pin_id?: string;
	status?: string;
	smsStatus?: string;
};

type TermiiVerifyTokenResponse = {
	verified?: boolean | string;
};

function toInternationalFormat(localPhone: string): string {
	const digits = localPhone.replace(/\D/g, "");
	return digits.replace(/^0/, "234");
}

function logTermiiError(context: string, error: unknown): void {
	if (axios.isAxiosError(error)) {
		console.error("Termii request failed:", {
			context,
			status: error.response?.status,
			code: error.code,
			response: error.response?.data,
		});
		return;
	}
	console.error("Termii request failed:", { context, error });
}

class TermiiProvider {
	private client: AxiosInstance;

	constructor() {
		this.client = axios.create({
			baseURL: TERMII_BASE_URL,
			timeout: TERMII_TIMEOUT_MS,
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
			},
		});
	}

	async sendOtp(phone: string): Promise<string> {
		if (OTP_CONSOLE_MODE) {
			console.log(`[DEV TERMII OTP] To: ${phone}`);
			return "dev-termii-pin-id";
		}

		try {
			const response = await this.client.post<TermiiSendTokenResponse>(
				"/api/sms/otp/send",
				{
					api_key: TERMII_API_KEY,
					message_type: "NUMERIC",
					pin_type: "NUMERIC",
					to: toInternationalFormat(phone),
					from: TERMII_SENDER_ID,
					channel: TERMII_CHANNEL,
					pin_attempts: 5,
					pin_time_to_live: 10,
					pin_length: 6,
					pin_placeholder: "< 123456 >",
					message_text:
						"Your PreChop verification code is < 123456 >. Valid for 10 minutes.",
				},
			);
			const pinId = response.data.pin_id ?? response.data.pinId;
			if (!pinId) {
				console.error(
					"Termii OTP response missing pin_id:",
					response.data,
				);
				throw new Error("Termii OTP response missing pin_id");
			}
			return pinId;
		} catch (error) {
			logTermiiError("otp.send", error);
			throw error;
		}
	}

	async verifyOtp(pinId: string, otp: string): Promise<boolean> {
		if (OTP_CONSOLE_MODE && pinId === "dev-termii-pin-id") {
			return false;
		}

		try {
			const response = await this.client.post<TermiiVerifyTokenResponse>(
				"/api/sms/otp/verify",
				{
					api_key: TERMII_API_KEY,
					pin_id: pinId,
					pin: otp,
				},
			);
			return String(response.data.verified).toLowerCase() === "true";
		} catch (error) {
			logTermiiError("otp.verify", error);
			throw error;
		}
	}
}

export const termiiProvider = new TermiiProvider();
