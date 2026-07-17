import AppShell from "@/layouts/AppShell";
import HelpWrapper from "@/libs/HelpWrapper";

export default async function HelpPage({
	searchParams,
}: {
	searchParams?: Promise<{ audience?: string }>;
}) {
	const params = await searchParams;
	const audience = params?.audience === "vendor" ? "vendor" : "buyer";

	return (
		<AppShell
			shellRole={audience === "vendor" ? "VENDOR" : "BUYER"}
			publicAccess
		>
			<HelpWrapper initialAudience={audience} />
		</AppShell>
	);
}
