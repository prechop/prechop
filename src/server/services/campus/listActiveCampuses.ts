import { listCampusesDB } from "../../models";

export interface PublicCampus {
	id: string;
	name: string;
	shortCode: string;
	state: string;
}

/** Public, active-only campus directory (id, name, shortCode, state). */
export async function listActiveCampuses(): Promise<PublicCampus[]> {
	const campuses = await listCampusesDB({ activeOnly: true });
	return campuses.map((c) => ({
		id: (c.id ?? c._id)?.toString(),
		name: c.name,
		shortCode: c.shortCode,
		state: c.state,
	}));
}
