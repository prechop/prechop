import AppShell from "@/layouts/AppShell";
import PolicyPageContent from "@/libs/PolicyPages";

export default function CancellationAndRefundsPage() {
	return (
		<AppShell shellRole="BUYER" publicAccess>
			<PolicyPageContent
				eyebrow="Policy"
				title="Cancellation and Refunds"
				summary="What happens when an order is cancelled or cannot be fulfilled."
				sections={[
					{
						title: "Cancellation",
						body: [
							"Buyers may cancel only while the order is still in an allowed early status.",
							"Vendors may reject an order they cannot fulfil.",
							"Once cooking or fulfillment has advanced, support may need to review the case.",
						],
					},
					{
						title: "Refund handling",
						body: [
							"When a paid order qualifies for a refund, Prechop starts the refund process through the original payment route.",
							"Refund timing can depend on Paystack and the buyer's bank.",
							"Prechop does not describe refunds as instant.",
						],
					},
					{
						title: "When to contact support",
						body: [
							"Contact support if an order was cancelled but the refund status has not changed after a reasonable time.",
							"Include the order number, payment reference if available and a short explanation.",
							"Support may ask the vendor or payment provider for more context.",
						],
					},
				]}
			/>
		</AppShell>
	);
}
