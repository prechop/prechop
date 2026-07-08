/**
 * All money in this system is stored as integers in kobo (1 Naira = 100 kobo).
 * Never use floats for money — these utilities are the only place conversion
 * between Naira and kobo should happen.
 */

export function nairaToKobo(naira: number): number {
	if (!Number.isFinite(naira) || naira < 0) {
		throw new Error("Invalid Naira amount");
	}
	return Math.round(naira * 100);
}

export function koboToNaira(kobo: number): number {
	if (!Number.isInteger(kobo) || kobo < 0) {
		throw new Error("Invalid kobo amount");
	}
	return kobo / 100;
}

/**
 * Formats kobo as a Naira display string with comma separators.
 * 250000 -> "₦2,500"; 250050 -> "₦2,500.50"
 */
export function formatKobo(kobo: number): string {
	const naira = koboToNaira(kobo);
	const hasKoboRemainder = kobo % 100 !== 0;
	return `₦${naira.toLocaleString("en-NG", {
		minimumFractionDigits: hasKoboRemainder ? 2 : 0,
		maximumFractionDigits: 2,
	})}`;
}

export function sumKobo(...amounts: number[]): number {
	return amounts.reduce((sum, amount) => {
		if (!Number.isInteger(amount)) {
			throw new Error("All kobo amounts must be integers");
		}
		return sum + amount;
	}, 0);
}
