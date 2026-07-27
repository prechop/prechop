import AppShell from "@/layouts/AppShell";
import PolicyPageContent from "@/libs/PolicyPages";

export default function BuyerPolicyPage() {
	return (
		<AppShell shellRole="BUYER" publicAccess>
			<PolicyPageContent
				eyebrow="Policy"
				title="Buyer Policy"
				summary="The basic responsibilities buyers accept when ordering on Prechop."
				sections={[
					{
						title: "Ordering",
						body: [
							"Choose the correct items, options, pickup or delivery mode and contact details before payment.",
							"Orders are reserved only after payment confirmation.",
							"Follow the order page for vendor updates and fulfilment instructions.",
						],
					},
					{
						title: "Pickup and delivery",
						body: [
							"For pickup, arrive at the vendor's listed pickup location and confirm handover when receiving the order.",
							"For delivery, provide accurate delivery details and stay reachable by phone.",
							"Delivery is vendor-managed unless Prechop announces a separate delivery service.",
						],
					},
					{
						title: "Support",
						body: [
							"Use Help / FAQs to report order, payment, refund, pickup or delivery issues.",
							"Support may review order history, payment references, messages and vendor updates when resolving a problem.",
						],
					},
				]}
			/>
		</AppShell>
	);
}
