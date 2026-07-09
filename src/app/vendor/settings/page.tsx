import AppShell from "@/layouts/AppShell";
import VendorSettingsWrapper from "@/libs/VendorSettingsWrapper";
import VendorStatusGate from "@/libs/VendorStatusGate";

export default function VendorSettingsPage() {
	return (
		<AppShell shellRole="VENDOR">
			<VendorStatusGate>
				<VendorSettingsWrapper />
			</VendorStatusGate>
		</AppShell>
	);
}
