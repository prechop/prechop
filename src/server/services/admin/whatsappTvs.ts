import { notFound, validationError } from "../../constants";
import {
	createWhatsappTvDB,
	deactivateWhatsappTvDB,
	listWhatsappTvsByCampusDB,
	updateWhatsappTvDB,
} from "../../models";
import type { IWhatsappTvCreateInput } from "../../models/whatsappTvs/types";

export function listWhatsappTvs(campusId: string) {
	return listWhatsappTvsByCampusDB({ campusId });
}

export async function createWhatsappTv(payload: {
	campusId: string;
	name: string;
	whatsappNumber: string;
	audienceSize?: number;
	priceRange?: string;
	displayOrder?: number;
}) {
	const tv = await createWhatsappTvDB(payload);
	if (!tv) throw validationError("Could not create WhatsApp TV.");
	return tv;
}

export async function updateWhatsappTv(
	id: string,
	payload: Partial<IWhatsappTvCreateInput>,
) {
	const updated = await updateWhatsappTvDB({ id, payload });
	if (!updated) throw notFound("WhatsApp TV");
	return updated;
}

export async function deactivateWhatsappTv(id: string) {
	const success = await deactivateWhatsappTvDB({ id });
	if (!success) throw notFound("WhatsApp TV");
	return { id, isActive: false };
}
