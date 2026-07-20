import { nairaToKobo, notFound, validationError } from "@/server/constants";
import {
	createOptionGroupDB,
	type IMenuOptionInput,
	type IOptionGroup,
	listOptionGroupsByVendorDB,
	softDeleteOptionGroupDB,
	updateOptionGroupDB,
} from "@/server/models";
import { resolveVendorByUserId, vendorIdOf } from "@/server/services/vendors";
import type {
	CreateOptionGroupInput,
	UpdateOptionGroupInput,
} from "@/server/validators/menu/optionGroups";

function toKoboOptions(
	options: { name: string; priceNaira: number; displayOrder?: number }[],
): IMenuOptionInput[] {
	return options.map((o, i) => ({
		name: o.name,
		priceKobo: nairaToKobo(o.priceNaira),
		displayOrder: o.displayOrder ?? i,
	}));
}

export async function listOptionGroups({
	userId,
}: {
	userId: string;
}): Promise<IOptionGroup[]> {
	const vendor = await resolveVendorByUserId({ userId });
	return listOptionGroupsByVendorDB({ vendorId: vendorIdOf(vendor) });
}

export async function createOptionGroup({
	userId,
	name,
	required,
	minSelect,
	maxSelect,
	displayOrder,
	options,
}: { userId: string } & CreateOptionGroupInput): Promise<IOptionGroup> {
	const vendor = await resolveVendorByUserId({ userId });
	if (!vendor.campusId) {
		throw validationError(
			"Complete your vendor campus before adding options.",
		);
	}
	const group = await createOptionGroupDB({
		payload: {
			vendorId: vendorIdOf(vendor),
			campusId: vendor.campusId.toString(),
			name,
			required,
			minSelect,
			maxSelect: maxSelect ?? null,
			displayOrder,
			options: toKoboOptions(options),
		},
	});
	if (!group) throw notFound("Option group");
	return group;
}

export async function updateOptionGroup({
	userId,
	groupId,
	name,
	required,
	minSelect,
	maxSelect,
	displayOrder,
	options,
}: {
	userId: string;
	groupId: string;
} & UpdateOptionGroupInput): Promise<IOptionGroup> {
	const vendor = await resolveVendorByUserId({ userId });
	const updated = await updateOptionGroupDB({
		id: groupId,
		vendorId: vendorIdOf(vendor),
		payload: {
			name,
			required,
			minSelect,
			maxSelect:
				maxSelect === undefined ? undefined : (maxSelect ?? null),
			displayOrder,
			options: options ? toKoboOptions(options) : undefined,
		},
	});
	if (!updated) throw notFound("Option group");
	return updated;
}

export async function deleteOptionGroup({
	userId,
	groupId,
}: {
	userId: string;
	groupId: string;
}): Promise<{ deleted: boolean }> {
	const vendor = await resolveVendorByUserId({ userId });
	const ok = await softDeleteOptionGroupDB({
		id: groupId,
		vendorId: vendorIdOf(vendor),
	});
	if (!ok) throw notFound("Option group");
	return { deleted: true };
}
