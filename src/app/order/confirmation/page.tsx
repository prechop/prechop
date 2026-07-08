import { Suspense } from "react";
import { PageLoader } from "@/components/Loader";
import OrderConfirmationWrapper from "@/libs/OrderConfirmationWrapper";

export default function OrderConfirmationPage() {
	return (
		<main style={{ padding: "24px 16px" }}>
			<Suspense fallback={<PageLoader />}>
				<OrderConfirmationWrapper />
			</Suspense>
		</main>
	);
}
