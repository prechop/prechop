import AppShell from "@/layouts/AppShell";
import DailyOrderComposerWrapper from "@/libs/DailyOrderComposerWrapper";
import VendorStatusGate from "@/libs/VendorStatusGate";

export default function NewDailyOrderPage() {
	return (
		<AppShell shellRole="VENDOR">
			<VendorStatusGate>
				<DailyOrderComposerWrapper />
			</VendorStatusGate>
		</AppShell>
	);
}
