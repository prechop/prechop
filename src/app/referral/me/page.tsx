import AppShell from "@/layouts/AppShell";
import ReferralDashboard from "@/libs/ReferralDashboard";

export default function ReferralDashboardPage() {
	return (
		<AppShell shellRole="BUYER">
			<ReferralDashboard />
		</AppShell>
	);
}
