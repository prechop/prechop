import AppShell from "@/layouts/AppShell";
import PolicyPageContent from "@/libs/PolicyPages";

export default function BuyerNoShowPage() {
	return (
		<AppShell shellRole="BUYER" publicAccess>
			<PolicyPageContent
				eyebrow="Policy"
				title="Buyer No-show"
				summary="What vendors and buyers should do when pickup or delivery cannot be completed."
				sections={[
					{
						title: "Pickup no-show",
						body: [
							"Vendors can report buyer no-show only after the allowed waiting period for a ready pickup order.",
							"The buyer may be asked to respond if they believe there was a problem.",
							"Support may review timing, messages and order status before closing the case.",
						],
					},
					{
						title: "Buyer unreachable during delivery",
						body: [
							"Vendors should try to contact the buyer before using the buyer-unreachable action.",
							"The report should include the arrival time, number of contact attempts and a short note.",
							"Delivery failed should be used only after the buyer-unreachable flow allows it.",
						],
					},
					{
						title: "Buyer responsibilities",
						body: [
							"Be available at the pickup or delivery time shown in the order.",
							"Keep your phone reachable for delivery orders.",
							"Report a problem quickly if the vendor marked a no-show but you were available.",
						],
					},
				]}
			/>
		</AppShell>
	);
}
