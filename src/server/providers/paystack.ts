import "server-only";
import crypto from "node:crypto";
import axios, { type AxiosInstance } from "axios";
import { APP_URL, IS_PROD, PAYSTACK_SECRET_KEY } from "../constants";
import { PaymentSettlementMode } from "../models/enums";

const PAYSTACK_BASE_URL = "https://api.paystack.co";

/**
 * Subaccount codes minted by the seed script (`scripts/seed.ts`) use this
 * prefix. They are placeholders that don't exist in any real Paystack account,
 * so they can never be used for a live split.
 */
export const SEED_SUBACCOUNT_PREFIX = "ACCT_seed";

export function isSeedPlaceholderSubaccount(code: string): boolean {
	return code.startsWith(SEED_SUBACCOUNT_PREFIX);
}

/**
 * Build the `/transaction/initialize` request body. Split fields
 * (`subaccount`, `transaction_charge`, `bearer`) are attached only for a real
 * subaccount. When `allowUnsplit` is set (non-production) and the code is a
 * seed placeholder, we fall back to a plain charge so local checkout works
 * without a real Paystack subaccount — Paystack rejects a fake subaccount with
 * a 404 "Invalid Subaccount." In production `allowUnsplit` is false so bad seed
 * data surfaces loudly instead of silently skipping the vendor split.
 */
export function buildInitializePayload(
	input: InitializeTransactionInput,
	opts: { allowUnsplit: boolean },
): Record<string, unknown> {
	const base = {
		email: input.email,
		amount: input.amountKobo,
		reference: input.reference,
		callback_url: input.callbackUrl ?? `${APP_URL}/order/confirmation`,
		metadata: input.metadata,
	};
	if (
		input.settlementMode ===
		PaymentSettlementMode.PLATFORM_BALANCE_TRANSFER_V2
	) {
		return base;
	}
	if (!input.subaccountCode) {
		throw new Error("V1 transaction initialization requires a subaccount");
	}
	if (
		opts.allowUnsplit &&
		isSeedPlaceholderSubaccount(input.subaccountCode)
	) {
		return base;
	}
	return {
		...base,
		subaccount: input.subaccountCode,
		// Platform keeps (total - vendorAmount): the buyer service fee plus
		// the 8% vendor commission. Vendor gets vendorAmount.
		transaction_charge: input.amountKobo - input.vendorAmountKobo,
		// Paystack deducts processing from the platform side.
		bearer: "account",
	};
}

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
	settlementMode?: PaymentSettlementMode;
	subaccountCode?: string;
	vendorAmountKobo: number;
	callbackUrl?: string;
	metadata: Record<string, unknown>;
}
interface InitializeTransactionResponse {
	authorization_url: string;
	access_code: string;
	reference: string;
}
export interface VerifyTransactionResponse {
	id?: number;
	status: string;
	reference: string;
	amount: number;
	currency?: string;
	domain?: "test" | "live" | string;
	channel: string;
	paid_at: string | null;
	metadata: Record<string, unknown>;
}
export type PaystackRefundStatus =
	| "pending"
	| "processing"
	| "needs-attention"
	| "failed"
	| "processed";

export interface RefundResponse {
	id: number;
	status: PaystackRefundStatus | string;
	amount: number;
	currency?: string;
	domain?: "test" | "live" | string;
	expected_at?: string | null;
	refunded_at?: string | null;
	transaction?:
		| number
		| {
				id?: number;
				reference?: string;
				currency?: string;
				domain?: string;
		  };
}
export interface PaystackBank {
	name: string;
	code: string;
	active: boolean;
}
export interface PaystackBalance {
	currency: string;
	balance: number;
}
export interface PaystackTransferRecipientResponse {
	recipient_code: string;
	name: string;
	details: {
		account_number: string;
		account_name?: string;
		bank_code: string;
		bank_name?: string;
	};
}
export interface PaystackTransferResponse {
	id?: number;
	amount: number;
	currency: string;
	reference: string;
	transfer_code: string;
	status: string;
	reason?: string;
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
		const payload = buildInitializePayload(input, {
			allowUnsplit: !IS_PROD,
		});
		const response = await this.client.post(
			"/transaction/initialize",
			payload,
		);
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

	async getRefund(refundId: string): Promise<RefundResponse> {
		const response = await this.client.get(`/refund/${refundId}`);
		return response.data.data;
	}

	/**
	 * Discover a refund Paystack may have accepted when our create request timed
	 * out before returning its id. Paystack's list endpoint filters by numeric
	 * transaction id, so resolve the stored transaction reference first.
	 */
	async findRefundForTransaction(
		transactionReference: string,
		amountKobo: number,
	): Promise<RefundResponse | null> {
		const transaction = await this.verifyTransaction(transactionReference);
		if (transaction.id == null) return null;
		const response = await this.client.get("/refund", {
			params: { transaction: transaction.id, perPage: 50 },
		});
		const refunds = (response.data.data ?? []) as RefundResponse[];
		const matches = refunds.filter(
			(refund) => refund.amount === amountKobo,
		);
		if (!matches.length) return null;
		const priority: Record<string, number> = {
			processed: 5,
			processing: 4,
			pending: 3,
			"needs-attention": 2,
			failed: 1,
		};
		return matches.sort(
			(a, b) => (priority[b.status] ?? 0) - (priority[a.status] ?? 0),
		)[0];
	}

	async getBanks(): Promise<PaystackBank[]> {
		const response = await this.client.get("/bank", {
			params: { currency: "NGN", country: "nigeria" },
		});
		return response.data.data;
	}

	async createTransferRecipient(input: {
		name: string;
		accountNumber: string;
		bankCode: string;
		metadata?: Record<string, unknown>;
	}): Promise<PaystackTransferRecipientResponse> {
		const response = await this.client.post("/transferrecipient", {
			type: "nuban",
			name: input.name,
			account_number: input.accountNumber,
			bank_code: input.bankCode,
			currency: "NGN",
			metadata: input.metadata,
		});
		return response.data.data;
	}

	async getBalance(): Promise<PaystackBalance[]> {
		const response = await this.client.get("/balance");
		return response.data.data;
	}

	async initiateTransfer(input: {
		amountKobo: number;
		recipientCode: string;
		reference: string;
		reason: string;
	}): Promise<PaystackTransferResponse> {
		const response = await this.client.post("/transfer", {
			source: "balance",
			amount: input.amountKobo,
			recipient: input.recipientCode,
			reference: input.reference,
			reason: input.reason,
			currency: "NGN",
		});
		return response.data.data;
	}

	async verifyTransfer(reference: string): Promise<PaystackTransferResponse> {
		const response = await this.client.get(
			`/transfer/verify/${encodeURIComponent(reference)}`,
		);
		return response.data.data;
	}

	/**
	 * Verify a webhook payload originated from Paystack via HMAC-SHA512 with the
	 * secret key. The RAW request body must be passed exactly as received — do
	 * not re-stringify a parsed object.
	 *
	 * Throws when the secret is unset rather than defaulting to "". An empty HMAC
	 * key is a *publicly known* key: anyone could compute a valid signature and
	 * forge a "payment succeeded" webhook that marks orders paid. `bootstrap.ts`
	 * asserts the var at boot, but that guard is production-only and lives in
	 * another file — so it fails open in dev/test and cannot be relied on here.
	 * Refusing at the point of use means there is no environment in which this
	 * function can verify against an empty key.
	 */
	verifyWebhookSignature(
		rawBody: string,
		signatureHeader: string | undefined,
	): boolean {
		if (!PAYSTACK_SECRET_KEY) {
			throw new Error(
				"PAYSTACK_SECRET_KEY unset — refusing to verify webhook",
			);
		}
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
