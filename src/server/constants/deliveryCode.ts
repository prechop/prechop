/**
 * Build the formatted delivery code from a vendor short ID prefix and a
 * sequence number, e.g. `CHI` + `1001` = `CHI1001`.
 */
export function buildDeliveryCode(
	vendorShortId: string,
	sequence: number,
): string {
	const prefix = vendorShortId.trim().toUpperCase().slice(0, 3);
	return `${prefix}${sequence}`;
}
