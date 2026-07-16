import AppShell from "@/layouts/AppShell";
import ReceiptWrapper from "@/libs/ReceiptWrapper";

export default async function ReceiptPage({
	params,
}: {
	params: Promise<{ token: string }>;
}) {
	const { token } = await params;
	return (
		<AppShell shellRole="BUYER" publicAccess>
			<ReceiptWrapper token={token} />
		</AppShell>
	);
}
