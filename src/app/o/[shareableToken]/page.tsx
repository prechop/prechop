import AppShell from "@/layouts/AppShell";
import OrderDetailWrapper from "@/libs/OrderDetailWrapper";

export default async function PublicOrderPage({
	params,
}: {
	params: Promise<{ shareableToken: string }>;
}) {
	const { shareableToken } = await params;
	return (
		<AppShell shellRole="BUYER" publicAccess>
			<OrderDetailWrapper token={shareableToken} />
		</AppShell>
	);
}
