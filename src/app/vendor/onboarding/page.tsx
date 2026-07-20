"use client";

import { useEffect, useState } from "react";
import { Suspense } from "react";
import { PageLoader } from "@/components/Loader";
import AppShell from "@/layouts/AppShell";
import VendorOnboardingWrapper from "@/libs/VendorOnboardingWrapper";
import type { VendorMe } from "@/libs/VendorOnboardingWrapper";
import { fetcher } from "@/constants/fetcher";
import { useAuth } from "@/hooks/Auth/useAuth";
import useSWR from "swr";

function VendorOnboardingContent() {
  const { user } = useAuth();
  const [vendorInitialized, setVendorInitialized] = useState(false);
  const {
    data: vendor,
    error,
    isLoading,
    mutate,
  } = useSWR<VendorMe>(vendorInitialized ? "/vendors/me" : null, fetcher, {
    shouldRetryOnError: (error) => {
      return error?.status !== 403;
    },
  });

  // Initialize vendor profile on first load
  useEffect(() => {
    const initializeVendor = async () => {
      if (vendorInitialized) return;
      try {
        // Call become-vendor to create vendor profile
        await fetch("/api/users/me/become-vendor", {
          method: "POST",
        });
        setVendorInitialized(true);
      } catch (err) {
        console.error("Failed to initialize vendor profile:", err);
        // Still try to proceed even if there's an error
        setVendorInitialized(true);
      }
    };

    initializeVendor();
  }, [vendorInitialized]);

  // Show loader while initializing vendor profile
  if (!vendorInitialized || isLoading) {
    return <PageLoader />;
  }

  // If vendor data loaded successfully
  if (vendor) {
    // Prefill email from auth user if vendor doesn't have it
    const vendorWithDefaults: VendorMe = {
      ...vendor,
      email: vendor.email || user?.email || "",
      contactPhone: vendor.contactPhone || user?.phone || "",
    };
    return (
      <VendorOnboardingWrapper
        vendor={vendorWithDefaults}
        onChanged={() => mutate()}
      />
    );
  }

  // Fallback: show empty form with prefilled email/phone from auth
  const emptyVendor: VendorMe = {
    id: "",
    businessName: "",
    vendorType: "",
    email: user?.email ?? "",
    contactPhone: user?.phone ?? "",
    description: "",
    categories: [],
    status: "PENDING_REVIEW",
    locationType: "ON_CAMPUS",
    campusIds: [],
    schoolId: "",
  };

  return (
    <VendorOnboardingWrapper vendor={emptyVendor} onChanged={() => mutate()} />
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
