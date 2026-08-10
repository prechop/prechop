"use client";

import AppShell from "@/layouts/AppShell";
import VendorSettingsWrapper from "@/libs/VendorSettingsWrapper";

export default function VendorStorePage() {
	return (
		<AppShell shellRole="VENDOR">
			<VendorSettingsWrapper mode="store" />
		</AppShell>
	);
}
