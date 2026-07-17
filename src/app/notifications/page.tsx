import AppShell from "@/layouts/AppShell";
import NotificationsWrapper from "@/libs/NotificationsWrapper";

export default function NotificationsPage() {
	return (
		<AppShell shellRole="BUYER">
			<NotificationsWrapper />
		</AppShell>
	);
}
