import { notFound } from "next/navigation";
import AppShell from "@/layouts/AppShell";
import VendorStorefrontWrapper from "@/libs/VendorStorefrontWrapper";
import { resolveVendorByStoreSlug } from "@/server/services/vendors";

export default async function FriendlyVendorStorefrontPage({
	params,
}: {
	params: Promise<{ storeSlug: string }>;
}) {
	const { storeSlug } = await params;
	const vendor = await resolveVendorByStoreSlug({ storeSlug });
	if (!vendor) notFound();

	return (
		<AppShell shellRole="BUYER" publicAccess>
			<VendorStorefrontWrapper vendorId={vendor._id.toString()} />
		</AppShell>
	);
}
