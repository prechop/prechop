import AppShell from "@/layouts/AppShell";
import HelpWrapper from "@/libs/HelpWrapper";

export default async function HelpPage({
	searchParams,
}: {
	searchParams?: Promise<{
		category?: string;
		order?: string;
		payment?: string;
	}>;
}) {
	const params = await searchParams;

	return (
		<AppShell publicAccess>
			<HelpWrapper
				initialCategory={params?.category ?? "ORDER"}
				initialOrderRef={params?.order ?? ""}
				initialPaymentRef={params?.payment ?? ""}
			/>
		</AppShell>
	);
}
