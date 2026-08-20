import AppShell from "@/layouts/AppShell";
import PolicyPageContent from "@/libs/PolicyPages";

export default function TermsPage() {
	return (
		<AppShell publicAccess>
			<PolicyPageContent
				eyebrow="Terms"
				title="Terms"
				summary="The terms that apply to your use of Prechop. Signed-in users see the operational terms relevant to their role."
				sections={[
					{
						title: "Using Prechop",
						audience: ["shared", "public"],
						body: [
							"Use accurate information, protect your account and use Prechop lawfully.",
							"Payment status, order status and vendor payout status are separate records and may change at different times.",
							"The linked operational policies form part of these Terms where they apply.",
						],
					},
					{
						title: "Buyer ordering and payment",
						audience: "buyer",
						body: [
							"Review the vendor, meal, fulfilment option, price and fees before paying through Paystack.",
							"A successful buyer payment confirms receipt of payment by Prechop; it does not mean the order is fulfilled or the vendor has been paid.",
							"Cancellations, refunds, delivery, pickup, handover, no-show and disputes follow the applicable policies shown in Help.",
						],
					},
					{
						title: "Buyer handover and conduct",
						audience: "buyer",
						body: [
							"Use the approved QR or PIN only at genuine handover and promptly report missing, incorrect or unsafe orders.",
							"Do not misuse payment disputes, reviews, vendor contact details or support channels.",
							"Refund availability depends on the order facts, policy and payment state; a request is not an automatic approval.",
						],
					},
					{
						title: "Vendor eligibility and operations",
						audience: "vendor",
						body: [
							"Keep identity, business, food-safety, menu, availability, fulfilment and verified bank-destination information accurate.",
							"Prepare only valid paid orders shown in vendor tools and complete handover through the approved QR/PIN flow or an authorized support-confirmed handover.",
							"Use buyer information only to fulfil and support the relevant order; do not retain or reuse it for unrelated marketing.",
						],
					},
					{
						title: "Vendor fees and V2 payouts",
						audience: "vendor",
						body: [
							"Applicable commission and fees are shown through the vendor application or relevant dashboard notice; configurable amounts are not fixed by this page.",
							"Buyer payment creates a pending vendor payable, not an immediate vendor settlement. Trusted completion begins the 24-hour review period.",
							"Disputes, refunds and payout holds can keep the affected amount held. After review, an eligible payout enters the next eligible automated payout run, then queued/processing Paystack Transfer to the verified vendor bank destination.",
							"Payout may be eligible, queued, processing, paid to bank, held, failed or reversed. Bank arrival remains subject to Paystack, banking processing and applicable holds.",
						],
					},
					{
						title: "Suspension, closure and enforcement",
						audience: ["buyer", "vendor"],
						body: [
							"Prechop may restrict or suspend access for fraud, abuse, unsafe conduct, repeated fulfilment problems or policy breaches.",
							"Account closure does not cancel unresolved orders, disputes, refunds, holds, lawful record retention or amounts properly due.",
							"Support decisions may use account, order, payment, handover, payout and message records relevant to the issue.",
						],
					},
				]}
			/>
		</AppShell>
	);
}
