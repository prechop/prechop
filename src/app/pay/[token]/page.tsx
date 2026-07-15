import ExternalPaymentWrapper from "@/libs/ExternalPaymentWrapper";

export default async function ExternalPaymentPage({
	params,
}: {
	params: Promise<{ token: string }>;
}) {
	const { token } = await params;
	return (
		<main style={{ padding: "24px 16px 0" }}>
			<ExternalPaymentWrapper token={token} />
		</main>
	);
}
