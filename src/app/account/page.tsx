import AppShell from "@/layouts/AppShell";
import AccountWrapper from "@/libs/AccountWrapper";

export default function AccountPage() {
	return (
		<AppShell shellRole="BUYER">
			<AccountWrapper />
		</AppShell>
	);
}
