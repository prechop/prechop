import AppShell from "@/layouts/AppShell";
import MyOrdersWrapper from "@/libs/MyOrdersWrapper";

export default function MyOrdersPage() {
	return (
		<AppShell shellRole="BUYER">
			<MyOrdersWrapper />
		</AppShell>
	);
}
