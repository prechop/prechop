import AppShell from "@/layouts/AppShell";
import DailyOrderComposerWrapper from "@/libs/DailyOrderComposerWrapper";

export default function NewDailyOrderPage() {
	return (
		<AppShell shellRole="VENDOR">
			<DailyOrderComposerWrapper />
		</AppShell>
	);
}
