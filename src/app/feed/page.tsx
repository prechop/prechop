import AppShell from "@/layouts/AppShell";
import FeedWrapper from "@/libs/FeedWrapper";

export default function FeedPage() {
	return (
		<AppShell shellRole="BUYER">
			<FeedWrapper />
		</AppShell>
	);
}
