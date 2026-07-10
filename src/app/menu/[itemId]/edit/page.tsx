import AppShell from "@/layouts/AppShell";
import MenuItemEditor from "@/libs/MenuItemEditor";
import VendorStatusGate from "@/libs/VendorStatusGate";

export default async function EditMenuItemPage({
	params,
}: {
	params: Promise<{ itemId: string }>;
}) {
	const { itemId } = await params;
	return (
		<AppShell shellRole="VENDOR">
			<VendorStatusGate>
				<MenuItemEditor itemId={itemId} />
			</VendorStatusGate>
		</AppShell>
	);
}
