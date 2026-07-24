import AppShell from "@/layouts/AppShell";
import PolicyPageContent from "@/libs/PolicyPages";

export default function DisputesPage() {
	return (
		<AppShell shellRole="BUYER" publicAccess>
			<PolicyPageContent
				eyebrow="Policy"
				title="Disputes"
				summary="How support reviews order, payment, pickup and delivery problems."
				sections={[
					{
						title: "What can be disputed",
						body: [
							"Missing orders, incorrect status, failed delivery, pickup problems, payment questions and refund questions can be reported.",
							"Buyers and vendors should include the order number and a clear description.",
							"Photos or message records may help support understand the case, when available.",
						],
					},
					{
						title: "Review process",
						body: [
							"Support reviews the order timeline, payment state, vendor actions and buyer messages.",
							"QR or PIN confirmation is useful context, but it is not treated as absolute proof by itself.",
							"Some cases may require follow-up with the buyer, vendor or payment provider.",
						],
					},
					{
						title: "Possible outcomes",
						body: [
							"Support may leave the order as completed, request more information, or start refund handling where policy allows.",
							"Refund timing can depend on Paystack and the buyer's bank.",
							"Repeated misuse of reports may affect account or vendor review decisions.",
						],
					},
				]}
			/>
		</AppShell>
	);
}
