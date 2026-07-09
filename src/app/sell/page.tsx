import { Suspense } from "react";
import { PageLoader } from "@/components/Loader";
import SellApplicationWrapper from "@/libs/SellApplicationWrapper";

export default function SellPage() {
	return (
		<Suspense fallback={<PageLoader />}>
			<SellApplicationWrapper />
		</Suspense>
	);
}
