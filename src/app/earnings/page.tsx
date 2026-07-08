import AppShell from "@/layouts/AppShell";
import EarningsWrapper from "@/libs/EarningsWrapper";

export default function EarningsPage() {
	return (
		<AppShell shellRole="VENDOR">
			<EarningsWrapper />
		</AppShell>
	);
}
