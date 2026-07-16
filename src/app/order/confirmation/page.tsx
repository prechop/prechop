import { Suspense } from "react";
import { PageLoader } from "@/components/Loader";
import AppShell from "@/layouts/AppShell";
import OrderConfirmationWrapper from "@/libs/OrderConfirmationWrapper";

export default function OrderConfirmationPage() {
	return (
		<AppShell shellRole="BUYER" publicAccess>
			<Suspense fallback={<PageLoader />}>
				<OrderConfirmationWrapper />
			</Suspense>
		</AppShell>
	);
}
