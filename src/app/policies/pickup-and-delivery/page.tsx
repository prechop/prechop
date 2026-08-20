import AppShell from "@/layouts/AppShell";
import PolicyPageContent from "@/libs/PolicyPages";
export default function Page() {
	return (
		<AppShell publicAccess>
			<PolicyPageContent
				eyebrow="Policy"
				title="Pickup and Delivery"
				summary="How trusted handover works for pickup and vendor-managed delivery."
				sections={[
					{
						title: "Trusted handover",
						audience: ["shared", "public"],
						body: [
							"Use QR or PIN only when food is genuinely received; authorized support may confirm handover where the established process allows.",
							"Handover records help review a case but are not absolute proof on their own.",
						],
					},
					{
						title: "Buyer responsibilities",
						audience: "buyer",
						body: [
							"Collect pickup orders when ready or provide accurate reachable delivery details.",
							"Do not share QR or PIN before receiving the order; report missing, incorrect or unsafe orders promptly.",
						],
					},
					{
						title: "Vendor responsibilities and payout",
						audience: "vendor",
						body: [
							"For pickup, mark ready before collection. For delivery, manage the rider, coverage, fee and estimate, and update the order as work progresses.",
							"Trusted completion begins the 24-hour review period; it does not itself mean the vendor has been paid.",
							"Disputes, refunds and holds can keep the affected payable from eligibility.",
						],
					},
				]}
			/>
		</AppShell>
	);
}
