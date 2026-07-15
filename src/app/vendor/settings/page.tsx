import AppShell from "@/layouts/AppShell";
import VendorSettingsWrapper from "@/libs/VendorSettingsWrapper";

export default function VendorSettingsPage() {
	return (
		<AppShell shellRole="VENDOR">
			<VendorSettingsWrapper />
		</AppShell>
	);
}
