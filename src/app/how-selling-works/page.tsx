import AppShell from "@/layouts/AppShell";
import PolicyPageContent from "@/libs/PolicyPages";

export default function HowSellingWorksPage() {
	return (
		<AppShell shellRole="VENDOR" publicAccess>
			<PolicyPageContent
				eyebrow="Vendor guide"
				title="How Selling Works"
				summary="A practical guide for running paid daily orders on Prechop."
				sections={[
					{
						title: "Before orders open",
						body: [
							"Create menu items with clear prices, photos, option groups and prep times.",
							"Publish a daily order with an opening time, cutoff time, pickup or delivery options and quantity limits.",
							"Keep your kitchen open status accurate so buyers know when you are accepting orders.",
						],
					},
					{
						title: "When buyers order",
						body: [
							"Buyers pay through Paystack before you cook their order.",
							"Paid orders appear in your dashboard and daily order page after payment confirmation.",
							"Accept orders promptly so buyers know the kitchen has taken responsibility for the order.",
						],
					},
					{
						title: "Cooking and fulfillment",
						body: [
							"Move accepted orders through cooking, ready and delivery statuses as the work happens.",
							"For pickup, mark the order ready and confirm handover with the buyer's QR or PIN.",
							"For delivery, start delivery when the rider leaves, then confirm handover with QR or PIN when the buyer receives it.",
						],
					},
					{
						title: "Delivery responsibility",
						body: [
							"Delivery is vendor-managed unless Prechop announces a separate delivery service.",
							"You choose your delivery fee, coverage and estimate, and you arrange the rider or delivery method.",
							"If the buyer is unreachable, use the buyer-unreachable action and add a clear note.",
						],
					},
					{
						title: "Earnings",
						body: [
							"Your earnings follow Paystack's settlement schedule for your connected account.",
							"Prechop shows order and settlement-related figures, but does not promise instant payout.",
							"Keep bank details correct before accepting live orders.",
						],
					},
				]}
			/>
		</AppShell>
	);
}
