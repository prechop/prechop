import AppShell from "@/layouts/AppShell";
import PipelineWrapper from "@/libs/PipelineWrapper";
import VendorStatusGate from "@/libs/VendorStatusGate";

export default function PipelinePage() {
	return (
		<AppShell shellRole="VENDOR">
			<VendorStatusGate>
				<PipelineWrapper />
			</VendorStatusGate>
		</AppShell>
	);
}
