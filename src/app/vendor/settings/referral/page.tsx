import AppShell from "@/layouts/AppShell";
import ReferralSettingsWrapper from "@/libs/ReferralSettingsWrapper";

export default function ReferralSettingsPage() {
	return (
		<AppShell shellRole="VENDOR">
			<ReferralSettingsWrapper />
		</AppShell>
	);
}
