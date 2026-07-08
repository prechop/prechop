import OrderDetailWrapper from "@/libs/OrderDetailWrapper";

export default async function PublicOrderPage({
	params,
}: {
	params: Promise<{ shareableToken: string }>;
}) {
	const { shareableToken } = await params;
	return (
		<main style={{ padding: "24px 16px 0" }}>
			<OrderDetailWrapper token={shareableToken} />
		</main>
	);
}
