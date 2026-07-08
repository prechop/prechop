import { conflict, notFound } from "../../constants";
import {
	createCampusDB,
	getCampusByShortCodeDB,
	listCampusesDB,
	updateCampusDB,
} from "../../models";

export function listCampuses() {
	return listCampusesDB({});
}

export async function createCampus(payload: {
	name: string;
	shortCode: string;
	state: string;
}) {
	const existing = await getCampusByShortCodeDB({
		shortCode: payload.shortCode,
	});
	if (existing) {
		throw conflict("A campus with this short code already exists.");
	}
	const campus = await createCampusDB({ payload });
	if (!campus) {
		throw conflict("A campus with this short code already exists.");
	}
	return campus;
}

export async function updateCampus(
	id: string,
	payload: {
		name?: string;
		shortCode?: string;
		state?: string;
		isActive?: boolean;
	},
) {
	const updated = await updateCampusDB({ id, payload });
	if (!updated) throw notFound("Campus");
	return updated;
}
