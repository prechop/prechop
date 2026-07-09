import AppShell from "@/layouts/AppShell";
import TimetableWrapper from "@/libs/TimetableWrapper";
import VendorStatusGate from "@/libs/VendorStatusGate";

export default function TimetablePage() {
	return (
		<AppShell shellRole="VENDOR">
			<VendorStatusGate>
				<TimetableWrapper />
			</VendorStatusGate>
		</AppShell>
	);
}
