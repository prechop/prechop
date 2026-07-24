import AppShell from "@/layouts/AppShell";
import PolicyPageContent from "@/libs/PolicyPages";

export default function PaymentsAndSettlementPage() {
	return (
		<AppShell shellRole="BUYER" publicAccess>
			<PolicyPageContent
				eyebrow="Policy"
				title="Payments and Settlement"
				summary="How Prechop handles payment display, confirmation and vendor earnings."
				sections={[
					{
						title: "Buyer payments",
						body: [
							"Buyers review the food subtotal, delivery fee and service fee before paying.",
							"Payment is processed through Paystack.",
							"An order moves forward after payment confirmation reaches Prechop.",
						],
					},
					{
						title: "Vendor settlement",
						body: [
							"Vendor earnings follow Paystack's settlement schedule for the connected account.",
							"Prechop may show expected settlement figures, but payment timing depends on Paystack and the banking system.",
							"Vendors should keep bank and business details accurate.",
						],
					},
					{
						title: "Payment issues",
						body: [
							"If a buyer paid but the order does not update, they should report the problem with the order or payment reference.",
							"Support may compare Prechop order status with Paystack confirmation events.",
							"Do not cook an order that has not appeared as paid or accepted in your vendor dashboard.",
						],
					},
				]}
			/>
		</AppShell>
	);
}
