"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import useSWR from "swr";
import { Button, Card, Stack, Text, Title } from "@/components";
import { PageLoader } from "@/components/Loader";
import { api } from "@/constants/api";
import { fetcher } from "@/constants/fetcher";
import { useAuth } from "@/hooks/Auth/useAuth";
import AppShell from "@/layouts/AppShell";
import type { VendorMe } from "@/libs/VendorOnboardingWrapper";
import VendorOnboardingWrapper from "@/libs/VendorOnboardingWrapper";

function VendorOnboardingContent() {
	const { user } = useAuth();
	const params = useSearchParams();
	const readOnly = params.get("mode") === "view";
	const [vendorInitialized, setVendorInitialized] = useState(false);
	const [initError, setInitError] = useState("");
	const {
		data: vendor,
		error,
		isLoading,
		mutate,
	} = useSWR<VendorMe>(vendorInitialized ? "/vendors/me" : null, fetcher, {
		shouldRetryOnError: (error) => {
			return error?.response?.status !== 403 && error?.status !== 403;
		},
	});

	// Initialize vendor profile on first load. This is what the Google "Sell on
	// Prechop" flow lands on, so it must create the draft vendor profile before
	// any `/vendors/me` read runs.
	useEffect(() => {
		const initializeVendor = async () => {
			if (vendorInitialized) return;
			try {
				await api.post("/users/me/become-vendor", {});
				setVendorInitialized(true);
				setInitError("");
			} catch (err) {
				setInitError(errMsg(err));
			}
		};

		initializeVendor();
	}, [vendorInitialized]);

	if (initError) {
		return (
			<Card $accent>
				<Stack $gap={10}>
					<Title $size={20}>Could not start vendor setup</Title>
					<Text $muted>{initError}</Text>
					<Button
						onClick={() => {
							setInitError("");
							setVendorInitialized(false);
						}}
					>
						Try again
					</Button>
				</Stack>
			</Card>
		);
	}

	if (!vendorInitialized || isLoading) return <PageLoader />;

	if (error && !vendor) {
		return (
			<Card $accent>
				<Stack $gap={10}>
					<Title $size={20}>Vendor setup needs a refresh</Title>
					<Text $muted>{errMsg(error)}</Text>
					<Button onClick={() => mutate()}>Reload setup</Button>
				</Stack>
			</Card>
		);
	}

	if (!vendor) return <PageLoader />;

	const vendorWithDefaults: VendorMe = {
		...vendor,
		email: vendor.email || user?.email || "",
		contactPhone: vendor.contactPhone || user?.phone || "",
	};

	return (
		<VendorOnboardingWrapper
			vendor={vendorWithDefaults}
			onChanged={() => mutate()}
			readOnly={readOnly}
		/>
	);
}

export default function VendorOnboardingPage() {
	return (
		<AppShell shellRole="VENDOR">
			<Suspense fallback={<PageLoader />}>
				<VendorOnboardingContent />
			</Suspense>
		</AppShell>
	);
}

function errMsg(e: unknown): string {
	const err = e as {
		response?: { data?: { message?: string } };
		message?: string;
	};
	return (
		err?.response?.data?.message ??
		err?.message ??
		"Something went wrong. Try again."
	);
}
