import { Suspense } from "react";
import { PageLoader } from "@/components/Loader";
import LoginWrapper from "@/libs/LoginWrapper";

export default function LoginPage() {
	return (
		<Suspense fallback={<PageLoader />}>
			<LoginWrapper />
		</Suspense>
	);
}
