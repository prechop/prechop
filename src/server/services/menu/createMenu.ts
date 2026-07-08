import { nairaToKobo } from "@/server/constants";
import { createMenuItemDB, type MenuCategory } from "@/server/models";
import {
	recomputeVendorCompleteness,
	resolveVendorByUserId,
	vendorIdOf,
} from "@/server/services/vendors";

export async function createMenuItem({
	userId,
	name,
	category,
	priceNaira,
	description,
	estimatedPrepMin,
	displayOrder,
}: {
	userId: string;
	name: string;
	category: MenuCategory;
	priceNaira: number;
	description?: string;
	estimatedPrepMin?: number;
	displayOrder?: number;
}) {
	const vendor = await resolveVendorByUserId({ userId });
	const vendorId = vendorIdOf(vendor);

	const item = await createMenuItemDB({
		payload: {
			vendorId,
			campusId: vendor.campusId,
			category,
			name,
			priceKobo: nairaToKobo(priceNaira),
			description,
			estimatedPrepMin,
			displayOrder,
		},
	});

	await recomputeVendorCompleteness({ vendorId, userId });
	return item;
}
