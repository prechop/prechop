import AppShell from "@/layouts/AppShell";
import PolicyPageContent from "@/libs/PolicyPages";
export default function Page() {
	return (
		<AppShell publicAccess>
			<PolicyPageContent
				eyebrow="Policy"
				title="No-show"
				summary="What happens when pickup or delivery cannot be completed."
				sections={[
					{
						title: "General review",
						audience: ["shared", "public"],
						body: [
							"A no-show or unreachable report is reviewed against timing, messages, contact attempts and order status.",
							"Do not falsely mark handover or share a QR/PIN to close an uncompleted order.",
						],
					},
					{
						title: "Buyer responsibilities",
						audience: "buyer",
						body: [
							"Be available at the shown pickup or delivery time and keep your phone reachable.",
							"Respond promptly if support asks about a no-show and report an incorrect vendor claim quickly.",
						],
					},
					{
						title: "Vendor responsibilities and payout",
						audience: "vendor",
						body: [
							"Use no-show only after the allowed wait and buyer-contact steps, with a clear note.",
							"A failed-delivery or no-show review is not trusted completion and keeps the affected payable held until resolved.",
						],
					},
				]}
			/>
		</AppShell>
	);
}
