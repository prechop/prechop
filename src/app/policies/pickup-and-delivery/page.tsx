import AppShell from "@/layouts/AppShell";
import PolicyPageContent from "@/libs/PolicyPages";

export default function PickupAndDeliveryPage() {
	return (
		<AppShell shellRole="BUYER" publicAccess>
			<PolicyPageContent
				eyebrow="Policy"
				title="Pickup and Delivery"
				summary="How handover works for pickup and vendor-managed delivery orders."
				sections={[
					{
						title: "Pickup",
						body: [
							"Pickup orders show the vendor pickup location when available.",
							"The buyer should collect the order when it is marked ready.",
							"The vendor should confirm handover using QR or PIN only when the buyer receives the food.",
						],
					},
					{
						title: "Delivery",
						body: [
							"Delivery is managed by the vendor, including rider choice, coverage, fee and delivery estimate.",
							"The buyer should provide reachable delivery details and phone number at checkout.",
							"The vendor should mark the order in transit when delivery starts and confirm handover when the buyer receives it.",
						],
					},
					{
						title: "Handover confirmation",
						body: [
							"QR or PIN confirmation helps record handover, but it is not described as absolute proof.",
							"Buyers should not share the code before collection or delivery.",
							"Support may still review reported problems after QR or PIN use.",
						],
					},
				]}
			/>
		</AppShell>
	);
}
