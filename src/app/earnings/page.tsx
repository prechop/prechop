import AppShell from "@/layouts/AppShell";
import EarningsWrapper from "@/libs/EarningsWrapper";
import VendorStatusGate from "@/libs/VendorStatusGate";

export default function EarningsPage() {
	return (
		<AppShell shellRole="VENDOR">
			<VendorStatusGate>
				<EarningsWrapper />
			</VendorStatusGate>
		</AppShell>
	);
}
