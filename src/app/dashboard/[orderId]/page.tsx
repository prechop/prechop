import AppShell from "@/layouts/AppShell";
import VendorDailyOrderDetailWrapper from "@/libs/VendorDailyOrderDetailWrapper";
import VendorStatusGate from "@/libs/VendorStatusGate";

export default async function DailyOrderDetailPage({
	params,
}: {
	params: Promise<{ orderId: string }>;
}) {
	const { orderId } = await params;
	return (
		<AppShell shellRole="VENDOR">
			<VendorStatusGate>
				<VendorDailyOrderDetailWrapper orderId={orderId} />
			</VendorStatusGate>
		</AppShell>
	);
}
