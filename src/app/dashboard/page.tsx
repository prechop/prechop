import AppShell from "@/layouts/AppShell";
import VendorDashboardWrapper from "@/libs/VendorDashboardWrapper";

export default function DashboardPage() {
	return (
		<AppShell shellRole="VENDOR">
			<VendorDashboardWrapper />
		</AppShell>
	);
}
