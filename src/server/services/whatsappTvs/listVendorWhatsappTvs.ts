import { tryDecrypt } from "../../constants";
import { listWhatsappTvsByCampusDB } from "../../models";

export interface PublicWhatsappTv {
	name: string;
	audienceSize: number;
	priceRange?: string;
	waUrl: string;
	displayOrder: number;
}

/**
 * Active WhatsApp TVs for a campus, shaped for vendor consumption. The
 * encrypted `whatsappNumber` is decrypted into a `wa.me` deep link and the raw
 * number is never exposed.
 */
export async function listVendorWhatsappTvs({
	campusId,
}: {
	campusId: string;
}): Promise<PublicWhatsappTv[]> {
	const tvs = await listWhatsappTvsByCampusDB({ campusId, activeOnly: true });
	return tvs.map((tv) => {
		const number = tryDecrypt(tv.whatsappNumber);
		return {
			name: tv.name,
			audienceSize: tv.audienceSize,
			priceRange: tv.priceRange,
			waUrl: `https://wa.me/${number}`,
			displayOrder: tv.displayOrder,
		};
	});
}
