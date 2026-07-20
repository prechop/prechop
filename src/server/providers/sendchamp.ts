import "server-only";
import axios, { type AxiosInstance } from "axios";
import {
	SENDCHAMP_API_KEY,
	SENDCHAMP_SENDER_ID,
	SENDCHAMP_TIMEOUT_MS,
	SMS_CONSOLE_MODE,
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
