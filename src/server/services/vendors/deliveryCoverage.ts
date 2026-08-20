import {
	DeliveryCoverageType,
	getVendorProfileByUserIdDB,
	updateVendorProfileDB,
} from "@/server/models";

export { DeliveryCoverageType };

export async function getVendorDeliveryCoverage({
	userId,
}: {
	userId: string;
}): Promise<{
	deliveryCoverageType: DeliveryCoverageType;
	deliveryLocations: string[];
	defaultDeliveryAvailable: boolean;
}> {
	const vendor = await getVendorProfileByUserIdDB({ userId });
	if (!vendor) {
		return {
			deliveryCoverageType: DeliveryCoverageType.SPECIFIC,
			deliveryLocations: [],
			defaultDeliveryAvailable: false,
		};
	}
	return {
		deliveryCoverageType: (vendor.deliveryCoverageType as DeliveryCoverageType) ?? DeliveryCoverageType.SPECIFIC,
		deliveryLocations: vendor.deliveryLocations ?? [],
		defaultDeliveryAvailable: vendor.defaultDeliveryAvailable ?? false,
	};
}

export async function updateVendorDeliveryCoverage({
	userId,
	deliveryCoverageType,
	deliveryLocations,
}: {
	userId: string;
	deliveryCoverageType?: DeliveryCoverageType;
	deliveryLocations?: string[];
}): Promise<{
	deliveryCoverageType: DeliveryCoverageType;
	deliveryLocations: string[];
	defaultDeliveryAvailable: boolean;
}> {
	const vendor = await getVendorProfileByUserIdDB({ userId });
	if (!vendor) throw new Error("Vendor profile not found");

	const updates: Record<string, unknown> = {};
	if (deliveryCoverageType !== undefined) {
		updates.deliveryCoverageType = deliveryCoverageType;
		updates.defaultDeliveryAvailable = deliveryCoverageType === DeliveryCoverageType.ANYWHERE;
	}
	if (deliveryLocations !== undefined) {
		updates.deliveryLocations = deliveryLocations.filter(
			(loc) => typeof loc === "string" && loc.trim().length > 0,
		);
	}

	await updateVendorProfileDB({
		id: vendor._id.toString(),
		payload: updates,
	});

	return getVendorDeliveryCoverage({ userId });
}
