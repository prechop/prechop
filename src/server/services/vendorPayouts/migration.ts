import {
	getPayoutV2SafetyState,
	isPayoutV2MoneyMovementAllowed,
} from "@/server/constants";
import {
	getActiveVendorTransferRecipientDB,
	getSettlementMigrationConfigDB,
	PaymentSettlementMode,
	type SettlementMigrationMode,
} from "@/server/models";

export interface PaymentSettlementClassification {
	settlementMode: PaymentSettlementMode;
	migrationModeAtCreation: SettlementMigrationMode;
	migrationConfigVersion: number;
	pilotMatched: boolean;
}

export async function classifyNewPaymentSettlement(input: {
	vendorId: string;
	campusId: string;
}): Promise<PaymentSettlementClassification> {
	const config = await getSettlementMigrationConfigDB();
	const vendorIds = config.pilotVendorIds.map(String);
	const campusIds = config.pilotCampusIds.map(String);
	const pilotMatched =
		vendorIds.includes(input.vendorId) ||
		campusIds.includes(input.campusId);
	const readiness = isPayoutV2MoneyMovementAllowed(getPayoutV2SafetyState());
	const requestedV2 =
		config.mode === "V2_NEW_PAYMENTS" ||
		(config.mode === "V2_PILOT" && pilotMatched);
	const recipient = requestedV2
		? await getActiveVendorTransferRecipientDB({ vendorId: input.vendorId })
		: null;

	return {
		settlementMode:
			requestedV2 && readiness && recipient?.verifiedAt
				? PaymentSettlementMode.PLATFORM_BALANCE_TRANSFER_V2
				: PaymentSettlementMode.DIRECT_SUBACCOUNT_V1,
		migrationModeAtCreation: config.mode,
		migrationConfigVersion: config.version,
		pilotMatched,
	};
}

export function assertMigrationModeCanBeSelected(input: {
	mode: SettlementMigrationMode;
	paystackApprovalStatus: string;
	legalAccountingStatus: string;
}): void {
	if (input.mode === "V1_ONLY" || input.mode === "EMERGENCY_V1") return;
	if (!isPayoutV2MoneyMovementAllowed(getPayoutV2SafetyState())) {
		throw new Error(
			"V2 checkout selection is unavailable until every runtime, Paystack, legal, and accounting readiness gate is approved.",
		);
	}
}
