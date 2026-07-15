export const BASIS_POINTS_DENOMINATOR = 10_000;

export const PRECHOP_VENDOR_COMMISSION_PERCENT = Number(
	process.env.PLATFORM_FEE_VENDOR_PERCENT ?? 8,
);
export const PRECHOP_BUYER_SERVICE_FEE_PERCENT = Number(
	process.env.PLATFORM_FEE_BUYER_PERCENT ?? 3,
);
export const PRECHOP_BUYER_SERVICE_FEE_MAX_KOBO = Number(
	process.env.PLATFORM_FEE_BUYER_MAX_KOBO ?? 20_000,
);

export const PRECHOP_VENDOR_COMMISSION_BASIS_POINTS =
	PRECHOP_VENDOR_COMMISSION_PERCENT * 100;
export const PRECHOP_BUYER_SERVICE_FEE_BASIS_POINTS =
	PRECHOP_BUYER_SERVICE_FEE_PERCENT * 100;

function percentOfKobo(amountKobo: number, basisPoints: number): number {
	return Math.round((amountKobo * basisPoints) / BASIS_POINTS_DENOMINATOR);
}

export function calculateVendorCommissionKobo(
	foodSubtotalKobo: number,
): number {
	return percentOfKobo(
		Math.max(0, foodSubtotalKobo),
		PRECHOP_VENDOR_COMMISSION_BASIS_POINTS,
	);
}

export function calculateBuyerServiceFeeKobo(
	foodSubtotalKobo: number,
): number {
	return Math.min(
		percentOfKobo(
			Math.max(0, foodSubtotalKobo),
			PRECHOP_BUYER_SERVICE_FEE_BASIS_POINTS,
		),
		PRECHOP_BUYER_SERVICE_FEE_MAX_KOBO,
	);
}

export const calculatePrechopCommissionKobo = calculateVendorCommissionKobo;
export const calculateBuyerPaidProcessingFeeKobo =
	calculateBuyerServiceFeeKobo;
