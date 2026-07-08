import AppShell from "@/layouts/AppShell";
import PipelineWrapper from "@/libs/PipelineWrapper";

export default function PipelinePage() {
	return (
		<AppShell shellRole="VENDOR">
			<PipelineWrapper />
		</AppShell>
	);
}
