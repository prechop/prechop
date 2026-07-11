import VendorStorefrontWrapper from "@/libs/VendorStorefrontWrapper";

export default async function VendorStorefrontPage({
	params,
}: {
	params: Promise<{ vendorId: string }>;
}) {
	const { vendorId } = await params;
	return (
		<main style={{ padding: "24px 16px 0" }}>
			<VendorStorefrontWrapper vendorId={vendorId} />
		</main>
	);
}
