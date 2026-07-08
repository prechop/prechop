import "server-only";
import crypto from "node:crypto";
import axios, { type AxiosInstance } from "axios";
import { APP_URL, PAYSTACK_SECRET_KEY } from "../constants";

const PAYSTACK_BASE_URL = "https://api.paystack.co";

interface CreateSubaccountInput {
	businessName: string;
	bankCode: string;
	accountNumber: string;
}
interface CreateSubaccountResponse {
	subaccount_code: string;
	account_number: string;
	account_name: string;
}
interface InitializeTransactionInput {
	email: string;
	amountKobo: number;
	reference: string;
	subaccountCode: string;
	vendorAmountKobo: number;
	metadata: Record<string, unknown>;
}
interface InitializeTransactionResponse {
	authorization_url: string;
	access_code: string;
	reference: string;
}
interface VerifyTransactionResponse {
	status: string;
	reference: string;
	amount: number;
	channel: string;
	paid_at: string | null;
	metadata: Record<string, unknown>;
}
interface RefundResponse {
	id: number;
	status: string;
	amount: number;
}
export interface PaystackBank {
	name: string;
	code: string;
	active: boolean;
}

class PaystackProvider {
	private client: AxiosInstance;

	constructor() {
		this.client = axios.create({
			baseURL: PAYSTACK_BASE_URL,
			headers: {
				Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
				"Content-Type": "application/json",
			},
			timeout: 15000,
		});
	}

	async createSubaccount(
		input: CreateSubaccountInput,
	): Promise<CreateSubaccountResponse> {
		const response = await this.client.post("/subaccount", {
			business_name: input.businessName,
			bank_code: input.bankCode,
			account_number: input.accountNumber,
			// We control the split per-transaction, not here.
			percentage_charge: 0,
		});
		return response.data.data;
	}

	async resolveAccountNumber(
		accountNumber: string,
		bankCode: string,
	): Promise<{ account_number: string; account_name: string }> {
		const response = await this.client.get("/bank/resolve", {
			params: { account_number: accountNumber, bank_code: bankCode },
		});
		return response.data.data;
	}

	async initializeTransaction(
		input: InitializeTransactionInput,
	): Promise<InitializeTransactionResponse> {
		const response = await this.client.post("/transaction/initialize", {
			email: input.email,
			amount: input.amountKobo,
			reference: input.reference,
			subaccount: input.subaccountCode,
			// Platform keeps (total − vendorAmount); vendor gets vendorAmount.
			transaction_charge: input.amountKobo - input.vendorAmountKobo,
			// Platform absorbs the Paystack processing fee, not the vendor.
			bearer: "account",
			callback_url: `${APP_URL}/order/confirmation`,
			metadata: input.metadata,
		});
		return response.data.data;
	}

	async verifyTransaction(
		reference: string,
	): Promise<VerifyTransactionResponse> {
		const response = await this.client.get(
			`/transaction/verify/${reference}`,
		);
		return response.data.data;
	}

	async refund(
		transactionReference: string,
		amountKobo: number,
	): Promise<RefundResponse> {
		const response = await this.client.post("/refund", {
			transaction: transactionReference,
			amount: amountKobo,
		});
		return response.data.data;
	}

	async getBanks(): Promise<PaystackBank[]> {
		const response = await this.client.get("/bank", {
			params: { currency: "NGN", country: "nigeria" },
		});
		return response.data.data;
	}

	/**
	 * Verify a webhook payload originated from Paystack via HMAC-SHA512 with the
	 * secret key. The RAW request body must be passed exactly as received — do
	 * not re-stringify a parsed object.
	 */
	verifyWebhookSignature(
		rawBody: string,
		signatureHeader: string | undefined,
	): boolean {
		if (!signatureHeader) return false;
		const computedHash = crypto
			.createHmac("sha512", PAYSTACK_SECRET_KEY)
			.update(rawBody)
			.digest("hex");
		const computedBuffer = Buffer.from(computedHash, "hex");
		const receivedBuffer = Buffer.from(signatureHeader, "hex");
		if (computedBuffer.length !== receivedBuffer.length) return false;
		return crypto.timingSafeEqual(computedBuffer, receivedBuffer);
	}
}

export const paystackProvider = new PaystackProvider();
