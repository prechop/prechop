"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import styled from "styled-components";
import { Badge, Button, Card, FadeIn, Stack, Text } from "@/components";
import { PageLoader } from "@/components/Loader";
import { useVendor } from "@/hooks/Vendor/useVendor";
import type { VendorMe } from "@/libs/VendorOnboardingWrapper";

interface GateView {
	icon: string;
	badge: { label: string; tone: "warning" | "primary" | "danger" };
	title: string;
	description: string;
	cta?: { label: string; href: string };
}

/**
 * Wrap the interactive body of a vendor-only page (menu, cooking, timetable,
 * earnings, the daily-order composer). Until the vendor is approved (status
 * ACTIVE) it renders a status screen explaining that their submission is
 * incomplete or still pending — instead of the editor — so a not-yet-verified
 * vendor can see *why* they're blocked. This is the UX side of the gate; the
 * API enforces the same status rule via `assertActiveVendor`.
 */
export default function VendorStatusGate({
	children,
}: {
	children: ReactNode;
}) {
	const { vendor, isLoading } = useVendor();

	if (isLoading && !vendor) return <PageLoader />;

	// Unlock on ACTIVE status alone — the same rule the server enforces via
	// `assertActiveVendor`. Marketplace completeness is a separate readiness
	// metric; requiring it here would lock an approved vendor out of the very
	// menu/timetable editors they need to raise it.
	if (vendor?.status === "ACTIVE") {
		return <>{children}</>;
	}

	const view = resolveView(vendor);
	return (
		<FadeIn>
			<Center>
				<Card
					style={{
						width: "100%",
						maxWidth: 520,
						textAlign: "center",
						padding: "var(--pc-space-7) var(--pc-space-6)",
					}}
				>
					<Stack $gap={4} style={{ alignItems: "center" }}>
						<Medallion aria-hidden>{view.icon}</Medallion>
						<Badge $tone={view.badge.tone}>
							{view.badge.label}
						</Badge>
						<Text $weight={800} $size={22}>
							{view.title}
						</Text>
						<Text $muted $size={15} style={{ maxWidth: "46ch" }}>
							{view.description}
						</Text>
						{view.cta && (
							<CtaButton
								label={view.cta.label}
								href={view.cta.href}
							/>
						)}
					</Stack>
				</Card>
			</Center>
		</FadeIn>
	);
}

/** Centres the gate card in the available space instead of floating it up top. */
const Center = styled.div`
	display: flex;
	align-items: center;
	justify-content: center;
	min-height: min(72vh, 640px);
	padding: var(--pc-space-4);
`;

/** Soft circular backdrop behind the status icon so it reads as intentional. */
const Medallion = styled.div`
	width: 76px;
	height: 76px;
	display: grid;
	place-items: center;
	border-radius: 999px;
	background: var(--pc-surface-2);
	border: 1px solid var(--pc-border);
	font-size: 40px;
	line-height: 1;
	margin-bottom: var(--pc-space-1);
`;

function CtaButton({ label, href }: { label: string; href: string }) {
	const router = useRouter();
	return (
		<Button
			$size="lg"
			style={{ marginTop: 8 }}
			onClick={() => router.push(href)}
		>
			{label}
		</Button>
	);
}

function resolveView(vendor: VendorMe | null): GateView {
	const status = vendor?.status;

	if (status === "PENDING_REVIEW") {
		return {
			icon: "🕒",
			badge: { label: "Under review", tone: "primary" },
			title: "Your application is under review",
			description:
				"We're checking over your submission. You'll be able to manage your menu, cooking, timetable and earnings as soon as it's approved — we'll notify you.",
		};
	}

	if (status === "CHANGES_REQUESTED") {
		const reason = vendor?.rejectionReason?.trim();
		return {
			icon: "✏️",
			badge: { label: "Changes requested", tone: "warning" },
			title: "A few changes are needed",
			description: reason
				? `Our team asked for some updates before approving your store: “${reason}” Update your details and resubmit to unlock this.`
				: "Our team asked for some updates before approving your store. Update your details and resubmit for review to unlock this.",
			cta: { label: "Update & resubmit", href: "/dashboard" },
		};
	}

	if (status === "SUSPENDED") {
		return {
			icon: "⛔",
			badge: { label: "Suspended", tone: "danger" },
			title: "Your store is suspended",
			description:
				"This vendor account is currently suspended, so store actions are unavailable. Please contact support if you think this is a mistake.",
		};
	}

	// INCOMPLETE or no profile yet (ACTIVE is unlocked above).
	return {
		icon: "📝",
		badge: { label: "Incomplete", tone: "warning" },
		title: "Finish your vendor submission",
		description:
			"Complete your store profile and submit it for review to start managing your menu, cooking, timetable and earnings.",
		cta: { label: "Continue setup", href: "/dashboard" },
	};
}
