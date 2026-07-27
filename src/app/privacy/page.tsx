import AppShell from "@/layouts/AppShell";
import PolicyPageContent from "@/libs/PolicyPages";

export default function PrivacyPage() {
	return (
		<AppShell publicAccess>
			<PolicyPageContent
				eyebrow="Privacy"
				title="Privacy"
				summary="How Prechop handles the account, order and support information needed to run the platform."
				sections={[
					{
						title: "Information we use",
						body: [
							"Prechop uses account details, campus selection, order details, payment references and support messages to provide ordering and vendor tools.",
							"Buyer delivery details are shared only where needed to fulfil the order.",
						],
					},
					{
						title: "Payments and support",
						body: [
							"Payment processing is handled through Paystack, and Prechop stores payment references needed for receipts, refunds and support.",
							"Support requests include the sender role, category, subject, message and related order or payment reference when provided.",
						],
					},
					{
						title: "Control",
						body: [
							"Users can update account and notification details from Account or Vendor Settings.",
							"Contact support from Help / FAQs for privacy questions or account issues.",
						],
					},
				]}
			/>
		</AppShell>
	);
}
