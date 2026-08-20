import AppShell from "@/layouts/AppShell";
import VendorFollowersWrapper from "@/libs/VendorFollowersWrapper";

export default function VendorFollowersPage() {
	return (
		<AppShell shellRole="VENDOR">
			<VendorFollowersWrapper />
		</AppShell>
	);
}
