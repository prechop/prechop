import AppShell from "@/layouts/AppShell";
import MenuItemEditor from "@/libs/MenuItemEditor";
import VendorStatusGate from "@/libs/VendorStatusGate";

export default function NewMenuItemPage() {
	return (
		<AppShell shellRole="VENDOR">
			<VendorStatusGate>
				<MenuItemEditor />
			</VendorStatusGate>
		</AppShell>
	);
}
