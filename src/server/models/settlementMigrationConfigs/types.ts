export const SETTLEMENT_MIGRATION_MODES = [
	"V1_ONLY",
	"V2_PILOT",
	"V2_NEW_PAYMENTS",
	"EMERGENCY_V1",
] as const;

export type SettlementMigrationMode =
	(typeof SETTLEMENT_MIGRATION_MODES)[number];

export interface ISettlementMigrationConfig {
	_id: string;
	id?: string;
	key: "primary";
	mode: SettlementMigrationMode;
	version: number;
	pilotVendorIds: string[];
	pilotCampusIds: string[];
	minimumPayoutKobo: number;
	transferFeesPaidBy: "PRECHOP";
	reservePolicyStatus: "EXTERNALLY_PENDING";
	legalAccountingStatus: "EXTERNALLY_PENDING" | "APPROVED";
	paystackApprovalStatus: "PENDING" | "APPROVED";
	updatedBy?: string;
	changeReason?: string;
	createdAt: Date;
	updatedAt: Date;
}
