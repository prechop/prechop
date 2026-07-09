import { validationError } from "@/server/constants";
import { getOptionGroupsByIdsDB } from "@/server/models";

/**
 * Validate that every id in `optionGroupIds` is an option group owned by this
 * vendor, and return them de-duplicated in the caller's order. Returns `[]` when
 * no ids are given and `undefined` when the field is absent (so callers can tell
 * "clear the list" from "leave unchanged"). Throws if any id is unknown or
 * belongs to another vendor.
 */
export async function resolveOwnedOptionGroupIds({
	vendorId,
	optionGroupIds,
}: {
	vendorId: string;
	optionGroupIds?: string[];
}): Promise<string[] | undefined> {
	if (optionGroupIds === undefined) return undefined;
	if (optionGroupIds.length === 0) return [];

	const unique = Array.from(new Set(optionGroupIds));
	const groups = await getOptionGroupsByIdsDB({ ids: unique, vendorId });
	const ownedIds = new Set(groups.map((g) => (g.id ?? g._id).toString()));
	const missing = unique.filter((id) => !ownedIds.has(id));
	if (missing.length > 0)
		throw validationError("One or more option groups were not found.");

	return unique;
}
