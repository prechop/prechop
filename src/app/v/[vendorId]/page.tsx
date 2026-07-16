import AppShell from "@/layouts/AppShell";
import VendorStorefrontWrapper from "@/libs/VendorStorefrontWrapper";

export default async function VendorStorefrontPage({
	params,
}: {
	params: Promise<{ vendorId: string }>;
}) {
	const { vendorId } = await params;
	return (
		<AppShell shellRole="BUYER" publicAccess>
			<VendorStorefrontWrapper vendorId={vendorId} />
		</AppShell>
	);
}
