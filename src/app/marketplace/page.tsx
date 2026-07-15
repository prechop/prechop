import AppShell from "@/layouts/AppShell";
import MarketplaceWrapper from "@/libs/MarketplaceWrapper";

export default function MarketplacePage() {
	return (
		<AppShell shellRole="BUYER" publicAccess>
			<MarketplaceWrapper />
		</AppShell>
	);
}
