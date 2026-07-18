import AppShell from "@/layouts/AppShell";
import HelpWrapper from "@/libs/HelpWrapper";

export default async function HelpPage({
	searchParams,
}: {
	searchParams?: Promise<{
		audience?: string;
		category?: string;
		order?: string;
		payment?: string;
	}>;
}) {
	const params = await searchParams;
	const audience = params?.audience === "vendor" ? "vendor" : "buyer";

	return (
		<AppShell
			shellRole={audience === "vendor" ? "VENDOR" : "BUYER"}
			publicAccess
		>
			<HelpWrapper
				initialAudience={audience}
				initialCategory={params?.category ?? "ORDER"}
				initialOrderRef={params?.order ?? ""}
				initialPaymentRef={params?.payment ?? ""}
			/>
		</AppShell>
	);
}
