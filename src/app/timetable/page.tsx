import AppShell from "@/layouts/AppShell";
import TimetableWrapper from "@/libs/TimetableWrapper";

export default function TimetablePage() {
	return (
		<AppShell shellRole="VENDOR">
			<TimetableWrapper />
		</AppShell>
	);
}
