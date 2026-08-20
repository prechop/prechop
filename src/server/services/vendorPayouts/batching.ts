import crypto from "node:crypto";
import {
	assertPayoutV2MoneyMovementEnabled,
	getPayoutV2SafetyState,
	isPayoutV2FoundationEnabled,
} from "@/server/constants";
import { acquireLock, releaseLock } from "@/server/databases";
import {
	claimVendorPayableForPayoutDB,
	createPayoutDraftOnceDB,
	createPayoutLineOnceDB,
	getActiveVendorTransferRecipientDB,
	getSettlementMigrationConfigDB,
	listDueEligibleVendorPayablesDB,
	listDueGraceVendorPayableOrderIdsDB,
	markPayoutPayablesDB,
	markPayoutQueuedDB,
	markPayoutSubmittedDB,
	PaymentSettlementMode,
} from "@/server/models";
import { paystackProvider } from "@/server/providers";
import { notifyAdminAttention } from "../notifications";
import { refreshVendorPayableForOrder } from "./foundation";

export function calculatePaystackTransferCosts(amountKobo: number): {
	transferFeeKobo: number;
	stampDutyKobo: number;
} {
	return {
		transferFeeKobo:
			amountKobo <= 500_000
				? 1_000
				: amountKobo <= 5_000_000
					? 2_500
					: 5_000,
		stampDutyKobo: amountKobo >= 1_000_000 ? 5_000 : 0,
	};
}

function transferReference(
	vendorId: string,
	payoutId: string,
	attempt: number,
): string {
	return `pch_v2_${vendorId.slice(-8)}_${payoutId.slice(-12)}_${attempt}`.toLowerCase();
}

export async function runVendorPayoutBatch(
	input: { now?: Date; limit?: number } = {},
): Promise<{
	created: number;
	submitted: number;
	insufficientBalance: boolean;
}> {
	const state = getPayoutV2SafetyState();
	if (!isPayoutV2FoundationEnabled(state)) {
		return { created: 0, submitted: 0, insufficientBalance: false };
	}
	const now = input.now ?? new Date();
	const config = await getSettlementMigrationConfigDB();
	const graceOrderIds = await listDueGraceVendorPayableOrderIdsDB({
		now,
		limit: input.limit ?? 1000,
	});
	for (const orderId of graceOrderIds) {
		await refreshVendorPayableForOrder({ orderId });
	}
	const due = await listDueEligibleVendorPayablesDB({
		now,
		limit: input.limit ?? 1000,
	});
	const groups = new Map<string, typeof due>();
	for (const payable of due) {
		const key = String(payable.vendorId);
		groups.set(key, [...(groups.get(key) ?? []), payable]);
	}
	const candidates: Array<{
		vendorId: string;
		payables: typeof due;
		total: number;
	}> = [];
	for (const [vendorId, payables] of groups) {
		const total = payables.reduce((sum, row) => sum + row.amountKobo, 0);
		if (total >= config.minimumPayoutKobo)
			candidates.push({ vendorId, payables, total });
	}
	if (!candidates.length)
		return { created: 0, submitted: 0, insufficientBalance: false };

	assertPayoutV2MoneyMovementEnabled();
	const required = candidates.reduce((sum, item) => {
		const costs = calculatePaystackTransferCosts(item.total);
		return sum + item.total + costs.transferFeeKobo + costs.stampDutyKobo;
	}, 0);
	const balances = await paystackProvider.getBalance();
	const ngnBalance =
		balances.find((item) => item.currency === "NGN")?.balance ?? 0;
	if (ngnBalance < required) {
		return { created: 0, submitted: 0, insufficientBalance: true };
	}

	let created = 0;
	let submitted = 0;
	for (const candidate of candidates) {
		const lockValue = crypto.randomUUID();
		const lockKey = `financial:vendor:${candidate.vendorId}`;
		if (!(await acquireLock(lockKey, lockValue, 120))) continue;
		try {
			const recipient = await getActiveVendorTransferRecipientDB({
				vendorId: candidate.vendorId,
			});
			if (!recipient) continue;
			const costs = calculatePaystackTransferCosts(candidate.total);
			const batchKey = `payout:v2:${candidate.vendorId}:${now.toISOString().slice(0, 10)}`;
			const payout = await createPayoutDraftOnceDB({
				payload: {
					vendorId: candidate.vendorId,
					settlementMode:
						PaymentSettlementMode.PLATFORM_BALANCE_TRANSFER_V2,
					currency: "NGN",
					totalAmountKobo: candidate.total,
					transferFeeKobo: costs.transferFeeKobo,
					stampDutyKobo: costs.stampDutyKobo,
					recipientSnapshot: {
						recipientId: String(recipient.id ?? recipient._id),
						recipientVersion: recipient.version,
						paystackRecipientCode: recipient.paystackRecipientCode,
						bankCode: recipient.bankCode,
						bankName: recipient.bankName,
						accountName: recipient.accountName,
						accountNumberLast4: recipient.accountNumberLast4,
						verifiedAt: recipient.verifiedAt,
					},
					idempotencyKey: batchKey,
				},
			});
			if (!payout) continue;
			const payoutId = String(payout.id ?? payout._id);
			if ((payout.transferAttempts?.length ?? 0) >= 3) {
				await notifyAdminAttention({
					kind: "PAYMENT_ISSUE",
					title: "Vendor payout retry limit reached",
					whatHappened: `Payout ${payoutId} reached three transfer attempts and needs finance review.`,
					submittedBy: "Vendor payout job",
					recordId: payoutId,
					adminPath: "/admin/payments",
					dedupeKey: `payout-retry-limit:${payoutId}`,
					severity: "critical",
				});
				continue;
			}
			let claimedAmount = 0;
			for (const payable of candidate.payables) {
				const paymentLockKey = `financial:payment:${String(payable.paymentId)}`;
				const paymentLockValue = crypto.randomUUID();
				if (!(await acquireLock(paymentLockKey, paymentLockValue, 30)))
					continue;
				try {
					const claimed = await claimVendorPayableForPayoutDB({
						id: String(payable.id ?? payable._id),
						payoutId,
					});
					if (!claimed) continue;
					const line = await createPayoutLineOnceDB({
						payload: {
							payoutId,
							vendorPayableId: String(payable.id ?? payable._id),
							buyerOrderId: String(payable.buyerOrderId),
							paymentId: String(payable.paymentId),
							vendorId: candidate.vendorId,
							settlementMode:
								PaymentSettlementMode.PLATFORM_BALANCE_TRANSFER_V2,
							amountKobo: payable.amountKobo,
							idempotencyKey: `payout-line:v2:${String(payable.id ?? payable._id)}`,
						},
					});
					if (line) claimedAmount += payable.amountKobo;
				} finally {
					await releaseLock(paymentLockKey, paymentLockValue);
				}
			}
			if (claimedAmount !== payout.totalAmountKobo) {
				await markPayoutPayablesDB({ payoutId, status: "ELIGIBLE" });
				continue;
			}
			created += payout.created ? 1 : 0;
			const reference = transferReference(
				candidate.vendorId,
				payoutId,
				(payout.transferAttempts?.length ?? 0) + 1,
			);
			const queued = await markPayoutQueuedDB({
				id: payoutId,
				reference,
			});
			if (!queued) continue;
			const result = await paystackProvider.initiateTransfer({
				amountKobo: payout.totalAmountKobo,
				recipientCode: payout.recipientSnapshot.paystackRecipientCode,
				reference,
				reason: "Prechop completed order payout",
			});
			await markPayoutSubmittedDB({
				id: payoutId,
				reference,
				code: result.transfer_code,
				providerStatus: result.status,
			});
			await markPayoutPayablesDB({ payoutId, status: "PROCESSING" });
			submitted += 1;
		} finally {
			await releaseLock(lockKey, lockValue);
		}
	}
	return { created, submitted, insufficientBalance: false };
}
