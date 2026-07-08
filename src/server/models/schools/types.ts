export type SchoolType = "University" | "Polytechnic" | "College of Education";

export const SCHOOL_TYPES: SchoolType[] = [
	"University",
	"Polytechnic",
	"College of Education",
];

export interface ISchoolCreateInput {
	name: string;
	state: string;
	type: SchoolType;
	isActive?: boolean;
}

export interface ISchool {
	_id: string;
	id?: string;
	name: string;
	state: string;
	type: SchoolType;
	isActive: boolean;
	createdAt: Date;
	updatedAt: Date;
}
