import { listSchoolsDB } from "@/server/models";

export async function listVendorSchools() {
	return listSchoolsDB({ activeOnly: true });
}
