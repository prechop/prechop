import AppShell from "@/layouts/AppShell";
import OrderStatusWrapper from "@/libs/OrderStatusWrapper";

export default async function OrderStatusPage({
	params,
}: {
	params: Promise<{ orderId: string }>;
}) {
	const { orderId } = await params;
	return (
		<AppShell shellRole="BUYER">
			<OrderStatusWrapper orderId={orderId} />
		</AppShell>
	);
}
