import AppShell from "@/layouts/AppShell";
import PolicyPageContent from "@/libs/PolicyPages";

export default function TermsPage() {
	return (
		<AppShell publicAccess>
			<PolicyPageContent
				eyebrow="Terms"
				title="Terms"
				summary="The core terms for using Prechop as a buyer, vendor or administrator."
				sections={[
					{
						title: "Using Prechop",
						body: [
							"Buyers use Prechop to browse vendors, reserve meals, pay and track orders.",
							"Vendors use Prechop to publish menus, accept paid orders and manage fulfilment.",
							"Users must provide accurate account, order, pickup, delivery and payment information.",
						],
					},
					{
						title: "Orders and payments",
						body: [
							"Orders are confirmed only after payment confirmation.",
							"Refunds, cancellations, no-shows and disputes are handled under the relevant Prechop policy pages.",
							"Delivery is vendor-managed unless Prechop announces a separate delivery service.",
						],
					},
					{
						title: "Platform rules",
						body: [
							"Prechop may restrict access where fraud, abuse, unsafe behaviour or repeated order problems are identified.",
							"Support decisions may use order history, payment references, vendor updates and user messages.",
						],
					},
				]}
			/>
		</AppShell>
	);
}
