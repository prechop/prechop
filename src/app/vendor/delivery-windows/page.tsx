"use client";

import AppShell from "@/layouts/AppShell";
import DeliveryWindowsWrapper from "@/libs/DeliveryWindowsWrapper";

export default function VendorDeliveryWindowsPage() {
	return (
		<AppShell shellRole="VENDOR">
			<DeliveryWindowsWrapper />
		</AppShell>
	);
}
