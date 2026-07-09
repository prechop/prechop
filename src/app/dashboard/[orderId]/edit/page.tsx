import AppShell from "@/layouts/AppShell";
import DailyOrderComposerWrapper from "@/libs/DailyOrderComposerWrapper";
import VendorStatusGate from "@/libs/VendorStatusGate";

export default async function EditDailyOrderPage({
	params,
}: {
	params: Promise<{ orderId: string }>;
}) {
	const { orderId } = await params;
	return (
		<AppShell shellRole="VENDOR">
			<VendorStatusGate>
				<DailyOrderComposerWrapper orderId={orderId} />
			</VendorStatusGate>
		</AppShell>
	);
}
