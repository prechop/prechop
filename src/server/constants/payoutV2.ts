import {
	PAYSTACK_MANUAL_PAYOUTS_APPROVED,
	PLATFORM_BALANCE_TRANSFER_V2_ENABLED,
	PLATFORM_BALANCE_TRANSFER_V2_MONEY_MOVEMENT_ENABLED,
	PAYOUT_V2_LEGAL_ACCOUNTING_APPROVED,
} from "./environments";

export interface PayoutV2SafetyState {
	foundationEnabled: boolean;
	paystackManualPayoutsApproved: boolean;
	moneyMovementEnabled: boolean;
	legalAccountingApproved: boolean;
}

export const PAYOUT_V2_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;

export function getPayoutV2SafetyState(): PayoutV2SafetyState {
	return {
		foundationEnabled: PLATFORM_BALANCE_TRANSFER_V2_ENABLED,
		paystackManualPayoutsApproved: PAYSTACK_MANUAL_PAYOUTS_APPROVED,
		moneyMovementEnabled:
			PLATFORM_BALANCE_TRANSFER_V2_MONEY_MOVEMENT_ENABLED,
		legalAccountingApproved: PAYOUT_V2_LEGAL_ACCOUNTING_APPROVED,
	};
}

export function isPayoutV2FoundationEnabled(
	state: PayoutV2SafetyState,
): boolean {
	return state.foundationEnabled;
}

export function isPayoutV2MoneyMovementAllowed(
	state: PayoutV2SafetyState,
): boolean {
	return (
		state.foundationEnabled &&
		state.paystackManualPayoutsApproved &&
		state.legalAccountingApproved &&
		state.moneyMovementEnabled
	);
}

export function assertPayoutV2FoundationEnabled(): void {
	const state = getPayoutV2SafetyState();
	if (!state.foundationEnabled) {
		throw new Error(
			"PLATFORM_BALANCE_TRANSFER_V2 is disabled; refusing V2 financial write",
		);
	}
}

/**
 * Mandatory future transfer interlock. No Phase 3 code calls Paystack transfers,
 * but any later money-moving entry point must call this before external I/O.
 */
export function assertPayoutV2MoneyMovementEnabled(): void {
	if (!isPayoutV2MoneyMovementAllowed(getPayoutV2SafetyState())) {
		throw new Error(
			"V2 money movement is locked; feature enablement, Paystack approval, and the money-movement interlock are all required",
		);
	}
}
