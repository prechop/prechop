import AppShell from "@/layouts/AppShell";
import ExternalPaymentWrapper from "@/libs/ExternalPaymentWrapper";

export default async function ExternalPaymentPage({
	params,
}: {
	params: Promise<{ token: string }>;
}) {
	const { token } = await params;
	return (
		<AppShell shellRole="BUYER" publicAccess>
			<ExternalPaymentWrapper token={token} />
		</AppShell>
	);
}
