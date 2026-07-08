import { conflict, notFound } from "../../constants";
import {
	createSchoolDB,
	listSchoolsDB,
	toggleSchoolActiveDB,
} from "../../models";
import type { SchoolType } from "../../models/schools/types";

export function listSchools() {
	return listSchoolsDB({});
}

export async function createSchool(payload: {
	name: string;
	state: string;
	type: SchoolType;
}) {
	const school = await createSchoolDB({ payload });
	if (!school) throw conflict("A school with this name already exists.");
	return school;
}

export async function toggleSchoolActive(id: string) {
	const updated = await toggleSchoolActiveDB({ id });
	if (!updated) throw notFound("School");
	return updated;
}
