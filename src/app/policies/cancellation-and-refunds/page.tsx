import AppShell from "@/layouts/AppShell";
import PolicyPageContent from "@/libs/PolicyPages";
export default function Page() {
	return (
		<AppShell publicAccess>
			<PolicyPageContent
				eyebrow="Policy"
				title="Cancellation and Refunds"
				summary="What happens when an order is cancelled or cannot be fulfilled."
				sections={[
					{
						title: "General rule",
						audience: ["shared", "public"],
						body: [
							"Cancellation, order status, refund status and vendor payout status are separate.",
							"Eligibility depends on the order stage, facts and applicable policy.",
						],
					},
					{
						title: "Buyer cancellations and refunds",
						audience: "buyer",
						body: [
							"You may cancel only while the order is in an allowed early status; later cases may require support review.",
							"When approved, Prechop starts the refund through the applicable payment route. Paystack and bank processing can vary.",
							"Include the order number and payment reference when asking support about a delayed or failed refund.",
						],
					},
					{
						title: "Vendor effect",
						audience: "vendor",
						body: [
							"Reject promptly if an order cannot be fulfilled and do not mark an order handed over unless trusted completion occurred.",
							"A cancellation, refund, dispute or payout hold keeps the affected pending payable from becoming eligible until resolved.",
							"If an adjustment applies after payout processing, its status will be reflected in the relevant payout or support record.",
						],
					},
				]}
			/>
		</AppShell>
	);
}
