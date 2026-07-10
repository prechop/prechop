"use client";

import useSWR from "swr";
import { fetcher } from "@/constants/fetcher";
import type { VendorMe } from "@/libs/VendorOnboardingWrapper";

/**
 * Fetch the current vendor's own profile (`GET /vendors/me`). Shares SWR's
 * cache key with the dashboard, so mounting this alongside it costs no extra
 * request. Powers the `VendorStatusGate` — the client needs the vendor's
 * `status` to decide whether to show the editor or the "submission incomplete /
 * pending" screen.
 */
export function useVendor() {
	const { data, error, isLoading, mutate } = useSWR<VendorMe>(
		"/vendors/me",
		fetcher,
	);
	return {
		vendor: data ?? null,
		isLoading,
		error,
		refresh: () => mutate(),
		mutate,
	};
}
