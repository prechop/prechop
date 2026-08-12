import AppShell from "@/layouts/AppShell";
import PolicyPageContent from "@/libs/PolicyPages";
export default function Page() {
	return (
		<AppShell publicAccess>
			<PolicyPageContent
				eyebrow="Policy"
				title="Disputes"
				summary="How support reviews order, payment, fulfilment and payout questions."
				sections={[
					{
						title: "Fair review",
						audience: ["shared", "public"],
						body: [
							"Support may review the order timeline, payment state, messages, photos and QR/PIN or authorized handover records.",
							"Handover confirmation is useful context, not absolute proof. Repeated misuse may lead to account review.",
						],
					},
					{
						title: "Buyer disputes",
						audience: "buyer",
						body: [
							"Report missing, incorrect, unsafe, failed-delivery, payment or refund problems with the order number and clear evidence when available.",
							"Possible outcomes include no change, a request for more information, or refund handling where policy permits.",
						],
					},
					{
						title: "Vendor disputes and payout holds",
						audience: "vendor",
						body: [
							"Respond to support with fulfilment facts and relevant evidence; use buyer data only for resolving that order.",
							"An open dispute holds the affected vendor payable. It becomes eligible only after resolution, the review period and all refund or payout-hold checks.",
							"Unrelated eligible payouts are handled according to their own records and applicable holds.",
						],
					},
				]}
			/>
		</AppShell>
	);
}
