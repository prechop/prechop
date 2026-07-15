import ReceiptWrapper from "@/libs/ReceiptWrapper";

export default async function ReceiptPage({
	params,
}: {
	params: Promise<{ token: string }>;
}) {
	const { token } = await params;
	return (
		<main style={{ padding: "24px 16px 0" }}>
			<ReceiptWrapper token={token} />
		</main>
	);
}
