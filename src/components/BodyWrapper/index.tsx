"use client";

import NextTopLoader from "nextjs-toploader";
import { SWRConfig } from "swr";
import { fetcher } from "@/constants/fetcher";
import { AuthProvider } from "@/hooks/Auth/useAuth";
import { ToastProvider } from "@/hooks/useToast";
import { GlobalStyle } from "@/styles/global";

export default function BodyWrapper({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<SWRConfig
			value={{
				fetcher,
				revalidateOnFocus: false,
				shouldRetryOnError: false,
			}}
		>
			<GlobalStyle />
			<NextTopLoader color="#E8590C" showSpinner={false} height={3} />
			<ToastProvider>
				<AuthProvider>{children}</AuthProvider>
			</ToastProvider>
		</SWRConfig>
	);
}
