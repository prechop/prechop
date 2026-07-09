import AppShell from "@/layouts/AppShell";
import MenuWrapper from "@/libs/MenuWrapper";
import VendorStatusGate from "@/libs/VendorStatusGate";

export default function MenuPage() {
	return (
		<AppShell shellRole="VENDOR">
			<VendorStatusGate>
				<MenuWrapper />
			</VendorStatusGate>
		</AppShell>
	);
}
