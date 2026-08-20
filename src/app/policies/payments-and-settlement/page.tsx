import AppShell from "@/layouts/AppShell";
import PolicyPageContent from "@/libs/PolicyPages";

export default function PaymentsAndSettlementPage() {
	return (
		<AppShell publicAccess>
			<PolicyPageContent
				eyebrow="Policy"
				title="Payments and Payouts"
				summary="How buyer payments and V2 vendor payouts move through separate lifecycles."
				sections={[
					{
						title: "Separate statuses",
						audience: ["shared", "public"],
						body: [
							"Payment status shows whether the buyer payment succeeded, failed or was refunded.",
							"Order status shows fulfilment progress. Vendor payout status separately shows whether an amount is pending, held, eligible, queued, processing, paid, failed or reversed.",
							"A successful buyer payment is not vendor settlement.",
						],
					},
					{
						title: "Buyer payments",
						audience: "buyer",
						body: [
							"Review displayed totals and fees before paying through Paystack.",
							"Prechop advances the order only after payment confirmation. Report a mismatch with the order or payment reference.",
							"Refund approval and completion are separate from order cancellation and remain subject to provider and banking processing.",
						],
					},
					{
						title: "Vendor payable and eligibility",
						audience: "vendor",
						body: [
							"Successful buyer payment creates a pending vendor payable; Paystack does not pay the vendor directly at checkout under V2.",
							"Trusted completion through the existing QR/PIN flow or authorized support-confirmed handover starts the 24-hour review period.",
							"An open dispute, refund or payout hold keeps the affected amount from payout eligibility.",
						],
					},
					{
						title: "Automated V2 payout",
						audience: "vendor",
						body: [
							"After review and required checks, an eligible amount enters the next eligible automated payout run.",
							"The payout moves through eligible, queued or processing states before Paystack Transfer sends it to the vendor's verified bank destination.",
							"Paid to bank, failed and reversed states are recorded where applicable. Timing remains subject to Paystack, bank processing and applicable holds.",
						],
					},
					{
						title: "Historical transactions",
						audience: ["buyer", "vendor"],
						body: [
							"Older transactions created under a retained legacy settlement mode continue to follow their recorded transaction terms.",
							"Legacy compatibility fields do not describe the V2 model used in this current public policy.",
						],
					},
				]}
			/>
		</AppShell>
	);
}
