import AppShell from "@/layouts/AppShell";
import VendorDashboardWrapper from "@/libs/VendorDashboardWrapper";
import VendorStatusGate from "@/libs/VendorStatusGate";

export default function DashboardPage() {
	return (
		<AppShell shellRole="VENDOR">
			<VendorStatusGate>
				<VendorDashboardWrapper />
			</VendorStatusGate>
		</AppShell>
	);
}
