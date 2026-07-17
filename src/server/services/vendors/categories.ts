import { normalizeMenuCategory } from "@/constants/menuCategories";
import { type MenuCategory, updateVendorProfileDB } from "@/server/models";
import { recomputeVendorCompleteness } from "./recomputeVendorCompleteness";
import { resolveVendorByUserId, vendorIdOf } from "./resolveVendor";

export async function setCategories({
	userId,
	categories,
}: {
	userId: string;
	categories: MenuCategory[];
}) {
	const vendor = await resolveVendorByUserId({ userId });
	const vendorId = vendorIdOf(vendor);

	const updated = await updateVendorProfileDB({
		id: vendorId,
		payload: {
			categories: Array.from(
				new Set(
					categories.map(
						(category) =>
							normalizeMenuCategory(category) as MenuCategory,
					),
				),
			),
		},
	});
	await recomputeVendorCompleteness({ vendorId, userId });
	return updated;
}
