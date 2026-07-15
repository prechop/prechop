import "server-only";
import axios, { type AxiosInstance } from "axios";
import {
	OTP_CONSOLE_MODE,
	SENDCHAMP_API_KEY,
	SENDCHAMP_SENDER_ID,
} from "../constants";

const SENDCHAMP_BASE_URL = "https://api.sendchamp.com/api/v1";

function toInternationalFormat(localPhone: string): string {
	// 08012345678 → 2348012345678
	return localPhone.replace(/^0/, "234");
}

class SendchampProvider {
	private client: AxiosInstance;

	constructor() {
		this.client = axios.create({
			baseURL: SENDCHAMP_BASE_URL,
			timeout: 10000,
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
		await this.client.post("/sms/send", {
			to: toInternationalFormat(to),
			message,
			sender_name: SENDCHAMP_SENDER_ID,
			route: "dnd",
		});
	}

	async sendOtp(phone: string, otp: string): Promise<void> {
		await this.send(
			phone,
			`Your PreChop verification code is ${otp}. Valid for 10 minutes. Do not share this code with anyone.`,
		);
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
