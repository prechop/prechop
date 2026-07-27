import AppShell from "@/layouts/AppShell";
import PolicyPageContent from "@/libs/PolicyPages";

export default function VendorPolicyPage() {
	return (
		<AppShell shellRole="VENDOR" publicAccess>
			<PolicyPageContent
				eyebrow="Policy"
				title="Vendor Policy"
				summary="The basic responsibilities vendors accept when selling on Prechop."
				sections={[
					{
						title: "Accurate listings",
						body: [
							"Use clear item names, prices, photos, categories and option details.",
							"Publish only items you can prepare during the selected order window.",
							"Keep quantities, availability and cutoff times accurate.",
						],
					},
					{
						title: "Order responsibility",
						body: [
							"Paid orders must be accepted, prepared and updated through the order statuses.",
							"If delivery is enabled, the vendor arranges and completes delivery.",
							"Vendors should contact support quickly when an order cannot be fulfilled.",
						],
					},
					{
						title: "Account standards",
						body: [
							"Business details, pickup location, delivery contact and payout details must be kept current.",
							"Prechop may pause or review a vendor account when orders, disputes or safety issues require it.",
						],
					},
				]}
			/>
		</AppShell>
	);
}
