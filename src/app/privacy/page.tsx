import AppShell from "@/layouts/AppShell";
import PolicyPageContent from "@/libs/PolicyPages";

export default function PrivacyPage() {
	return (
		<AppShell publicAccess>
			<PolicyPageContent
				eyebrow="Privacy"
				title="Privacy Notice"
				summary="How Prechop collects, uses, shares and protects information needed to operate the marketplace."
				sections={[
					{
						title: "Information we collect",
						audience: ["shared", "public"],
						body: [
							"We collect account and contact details, campus or service location, device and security information, communications, support records and activity needed to operate Prechop.",
							"We record order, payment-reference, refund, dispute and fulfilment information. We do not need to store your full payment-card details.",
						],
					},
					{
						title: "Why we use information",
						audience: ["shared", "public"],
						body: [
							"We use information to provide accounts and orders, process payments and refunds, prevent fraud, secure the service, resolve disputes, meet legal duties and improve Prechop.",
							"Where required, we rely on contract performance, legal obligations, legitimate interests or consent appropriate to the activity.",
						],
					},
					{
						title: "Buyer information",
						audience: "buyer",
						body: [
							"We use buyer order, pickup or delivery, payment, handover, review and support information to provide and protect purchases.",
							"We share only the order details a vendor or service provider needs for fulfilment, payment, refund or support.",
						],
					},
					{
						title: "Vendor information",
						audience: "vendor",
						body: [
							"We use vendor identity, business, verification, menu, fulfilment, performance and support information to operate vendor services.",
							"Verified bank-destination and Paystack recipient, payable and transfer records are used to administer V2 payouts, reconciliation, refunds, disputes and lawful reporting.",
							"Buyer data received for an order must be used only for that order and protected from unauthorized access or reuse.",
						],
					},
					{
						title: "Sharing, retention and security",
						audience: ["shared", "public"],
						body: [
							"We share necessary information with Paystack, infrastructure and communications providers, relevant vendors, professional advisers and authorities where lawfully required.",
							"We keep information only as long as needed for service, security, dispute, accounting and legal purposes, then delete or de-identify it where appropriate.",
							"We use reasonable organizational and technical safeguards, but no online service can promise absolute security.",
						],
					},
					{
						title: "Your choices and rights",
						audience: ["shared", "public"],
						body: [
							"Use Account or Vendor Settings to update available details and notification choices.",
							"Contact support through Help to request access, correction, deletion or another applicable privacy right. Some records may be retained where legally required or needed for unresolved transactions.",
						],
					},
				]}
			/>
		</AppShell>
	);
}
