import crypto from "node:crypto";
import {
	encrypt,
	getPayoutV2SafetyState,
	isPayoutV2MoneyMovementAllowed,
} from "@/server/constants";
import {
	createVendorTransferRecipientRecordOnceDB,
	getActiveVendorTransferRecipientDB,
	getNextVendorTransferRecipientVersionDB,
	retireActiveVendorTransferRecipientDB,
} from "@/server/models";
import { paystackProvider } from "@/server/providers";

export async function synchronizeVendorTransferRecipient(input: {
	vendorId: string;
	accountNumber: string;
	accountName: string;
	bankCode: string;
	bankName: string;
	actorId?: string;
}): Promise<void> {
	if (!isPayoutV2MoneyMovementAllowed(getPayoutV2SafetyState())) return;
	const fingerprint = crypto
		.createHash("sha256")
		.update(`${input.vendorId}:${input.bankCode}:${input.accountNumber}`)
		.digest("hex");
	const current = await getActiveVendorTransferRecipientDB({
		vendorId: input.vendorId,
	});
	if (
		current?.bankCode === input.bankCode &&
		current.accountNumberLast4 === input.accountNumber.slice(-4)
	)
		return;

	const recipient = await paystackProvider.createTransferRecipient({
		name: input.accountName,
		accountNumber: input.accountNumber,
		bankCode: input.bankCode,
		metadata: { vendorId: input.vendorId, bankFingerprint: fingerprint },
	});
	if (current) {
		await retireActiveVendorTransferRecipientDB({
			vendorId: input.vendorId,
			actorId: input.actorId,
			note: "Vendor submitted and reverified different bank details.",
		});
	}
	await createVendorTransferRecipientRecordOnceDB({
		payload: {
			vendorId: input.vendorId,
			version: await getNextVendorTransferRecipientVersionDB({
				vendorId: input.vendorId,
			}),
			paystackRecipientCode: recipient.recipient_code,
			bankCode: input.bankCode,
			bankName: recipient.details.bank_name ?? input.bankName,
			accountName: recipient.details.account_name ?? input.accountName,
			accountNumberEncrypted: encrypt(input.accountNumber),
			accountNumberLast4: input.accountNumber.slice(-4),
			verifiedAt: new Date(),
			verifiedBy: input.actorId,
			idempotencyKey: `recipient:${input.vendorId}:${fingerprint}`,
		},
	});
}
