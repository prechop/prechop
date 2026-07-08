import { ErrVendorNotActive } from "@/server/constants";
import { setVendorOpenForOrdersDB, VendorStatus } from "@/server/models";
import { resolveVendorByUserId, vendorIdOf } from "./resolveVendor";

export async function setOpenStatus({
	userId,
	isOpenForOrders,
}: {
	userId: string;
	isOpenForOrders: boolean;
}) {
	const vendor = await resolveVendorByUserId({ userId });
	if (vendor.status !== VendorStatus.ACTIVE) throw ErrVendorNotActive;

	const vendorId = vendorIdOf(vendor);
	await setVendorOpenForOrdersDB({ id: vendorId, isOpenForOrders });
	return { isOpenForOrders };
}
