import AppShell from "@/layouts/AppShell";
import MenuWrapper from "@/libs/MenuWrapper";

export default function MenuPage() {
	return (
		<AppShell shellRole="VENDOR">
			<MenuWrapper />
		</AppShell>
	);
}
