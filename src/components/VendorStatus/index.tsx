"use client";

/**
 * Vendor / listing availability status — PRD §8.6.
 *
 * One resolver, one badge, five states. Availability is derived here and only
 * here so the marketplace feed, the vendor directory, the storefront header and
 * the search results can never drift apart (today each recomputes its own
 * ad-hoc `closed`/`comingSoon` booleans inline).
 *
 * Domain rules encoded:
 *  - A listing opens at `availableFrom` and closes at `cutoffTime`. Before
 *    `availableFrom` it is visible but NOT orderable ("Opens {time}").
 *  - `isOpenForOrders = false` is the vendor's global kill switch and outranks
 *    every listing-level signal — this mirrors the server, which rejects orders
 *    to a closed kitchen regardless of cutoff (see placeOrder.ts).
 *  - "New vendor" is a TRUST signal, not an availability signal. It is a
 *    separate badge (see ../VendorRating) and never replaces these four.
 *
 * Accessibility: colour is never the sole carrier. Every badge renders a text
 * label plus a shape-distinct glyph, and exposes a fuller sentence via
 * `aria-label`. The countdown badge is a live region.
 */

import { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { Badge } from "../Text";

/** Minutes before cutoff at which a listing flips to "Closing soon". PRD §8.6. */
export const CLOSING_SOON_MINUTES = 30;

/** How often a mounted status badge re-derives itself. */
export const STATUS_TICK_MS = 30_000;

export type VendorStatusKind =
	| "OPEN"
	| "CLOSING_SOON"
	| "OPENS_AT"
	| "CLOSED_TODAY";

export type ClosedReason = "VENDOR_CLOSED" | "NO_LISTINGS" | "PAST_CUTOFF";

type Tone = "success" | "warning" | "primary" | "muted";

/** The minimum shape this module needs off a listing. */
export interface StatusListing {
	status?: "DRAFT" | "ACTIVE" | "CLOSED" | "CANCELLED";
	/** Ordering opens at this time. Absent ⇒ orderable from publish. */
	availableFrom?: string | Date | null;
	cutoffTime: string | Date;
}

export interface VendorStatus {
	kind: VendorStatusKind;
	/** Full copy for the badge. */
	label: string;
	/** Compact copy for tight surfaces (card corners). */
	compactLabel: string;
	/** Shape-distinct, aria-hidden. Never the sole carrier of meaning. */
	glyph: string;
	tone: Tone;
	/** Screen-reader / tooltip sentence. */
	description: string;
	/** True only when a buyer can actually add to cart right now. */
	orderable: boolean;
	opensAt?: Date;
	cutoffAt?: Date;
	minutesToCutoff?: number;
	closedReason?: ClosedReason;
}

/** Lower rank wins when folding many listings into one vendor-level status. */
const RANK: Record<VendorStatusKind, number> = {
	OPEN: 0,
	CLOSING_SOON: 1,
	OPENS_AT: 2,
	CLOSED_TODAY: 3,
};

function toDate(v: string | Date | null | undefined): Date | undefined {
	if (v == null) return undefined;
	const d = typeof v === "string" ? new Date(v) : v;
	return Number.isNaN(d.getTime()) ? undefined : d;
}

/** "11:30am" — compact, mobile-first, matches the en-NG locale used elsewhere. */
export function formatClock(value: string | Date): string {
	const d = toDate(value);
	if (!d) return "";
	return d
		.toLocaleTimeString("en-NG", {
			hour: "numeric",
			minute: "2-digit",
			hour12: true,
		})
		.replace(/\s/g, "")
		.toLowerCase();
}

function closed(reason: ClosedReason): VendorStatus {
	return {
		kind: "CLOSED_TODAY",
		label: "Closed today",
		compactLabel: "Closed",
		glyph: "○",
		tone: "muted",
		orderable: false,
		closedReason: reason,
		description:
			reason === "VENDOR_CLOSED"
				? "Closed today — this kitchen has paused orders"
				: reason === "NO_LISTINGS"
					? "Closed today — nothing listed for today"
					: "Closed today — the cutoff has passed",
	};
}

/**
 * Resolve a single listing's status.
 * `vendorOpen === false` forces CLOSED_TODAY, matching server enforcement.
 */
export function resolveListingStatus(
	listing: StatusListing,
	opts: { vendorOpen?: boolean; now?: number } = {},
): VendorStatus {
	const now = opts.now ?? Date.now();

	if (opts.vendorOpen === false) return closed("VENDOR_CLOSED");
	if (listing.status && listing.status !== "ACTIVE")
		return closed(
			listing.status === "CLOSED" ? "PAST_CUTOFF" : "NO_LISTINGS",
		);

	const cutoffAt = toDate(listing.cutoffTime);
	if (!cutoffAt) return closed("NO_LISTINGS");
	if (cutoffAt.getTime() <= now) return closed("PAST_CUTOFF");

	const opensAt = toDate(listing.availableFrom);
	if (opensAt && opensAt.getTime() > now) {
		const at = formatClock(opensAt);
		return {
			kind: "OPENS_AT",
			label: `Opens ${at}`,
			compactLabel: `Opens ${at}`,
			glyph: "◷",
			tone: "primary",
			orderable: false,
			opensAt,
			cutoffAt,
			description: `Opens at ${at} — you can look, but ordering hasn't started`,
		};
	}

	const minutesToCutoff = Math.max(
		0,
		Math.floor((cutoffAt.getTime() - now) / 60_000),
	);

	if (minutesToCutoff <= CLOSING_SOON_MINUTES) {
		return {
			kind: "CLOSING_SOON",
			label: `Closing soon · ${minutesToCutoff}m`,
			compactLabel: `Closing · ${minutesToCutoff}m`,
			glyph: "◐",
			tone: "warning",
			orderable: true,
			cutoffAt,
			minutesToCutoff,
			description: `Closing soon — ${minutesToCutoff} minute${
				minutesToCutoff === 1 ? "" : "s"
			} left to order`,
		};
	}

	return {
		kind: "OPEN",
		label: "Open · Taking orders",
		compactLabel: "Open",
		glyph: "●",
		tone: "success",
		orderable: true,
		cutoffAt,
		minutesToCutoff,
		description: "Open — taking orders now",
	};
}

/**
 * Fold a vendor's listings into a single storefront/directory status.
 * Best listing wins: one comfortably-open listing makes the vendor "Open" even
 * if another is about to close.
 */
export function resolveVendorStatus(
	input: {
		isOpenForOrders?: boolean;
		listings?: StatusListing[] | null;
	},
	opts: { now?: number } = {},
): VendorStatus {
	if (input.isOpenForOrders === false) return closed("VENDOR_CLOSED");

	const listings = input.listings ?? [];
	if (listings.length === 0) return closed("NO_LISTINGS");

	let best: VendorStatus | undefined;
	for (const l of listings) {
		const s = resolveListingStatus(l, { now: opts.now });
		if (!best || RANK[s.kind] < RANK[best.kind]) best = s;
	}
	return best ?? closed("NO_LISTINGS");
}

/**
 * Live status that re-derives on a timer, so "Open" decays to "Closing soon"
 * and then "Closed today" without a refetch or page refresh.
 */
export function useVendorStatus(
	input: { isOpenForOrders?: boolean; listings?: StatusListing[] | null },
	opts: { tickMs?: number } = {},
): VendorStatus {
	const [now, setNow] = useState(() => Date.now());
	const tickMs = opts.tickMs ?? STATUS_TICK_MS;

	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), tickMs);
		return () => clearInterval(id);
	}, [tickMs]);

	const { isOpenForOrders, listings } = input;
	return useMemo(
		() => resolveVendorStatus({ isOpenForOrders, listings }, { now }),
		[isOpenForOrders, listings, now],
	);
}

/** Live status for a single listing. */
export function useListingStatus(
	listing: StatusListing | null | undefined,
	opts: { vendorOpen?: boolean; tickMs?: number } = {},
): VendorStatus | null {
	const [now, setNow] = useState(() => Date.now());
	const tickMs = opts.tickMs ?? STATUS_TICK_MS;

	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), tickMs);
		return () => clearInterval(id);
	}, [tickMs]);

	const vendorOpen = opts.vendorOpen;
	return useMemo(
		() =>
			listing ? resolveListingStatus(listing, { vendorOpen, now }) : null,
		[listing, vendorOpen, now],
	);
}

/* ------------------------------------------------------------------ Badge */

/** Text-only ink per tone. See --pc-color-*-ink in src/styles/global.ts: the
 *  bright brand hues fail WCAG AA as 12px/700 badge text on their own tints. */
const TONE_INK: Record<Tone, string> = {
	success: "var(--pc-color-success-ink)",
	warning: "var(--pc-color-warning-ink)",
	primary: "var(--pc-color-primary-ink)",
	muted: "var(--pc-color-muted-ink)",
};

const Pill = styled(Badge)<{ $kind: VendorStatusKind; $onHero?: boolean }>`
	/* A second, non-colour channel: closed states read as outline-only, live
	   states read as filled. Survives greyscale and colour-blind vision. */
	border: 1px solid
		${(p) => (p.$kind === "CLOSED_TODAY" ? "currentColor" : "transparent")};
	color: ${(p) => TONE_INK[p.$tone as Tone] ?? "var(--pc-color-primary-ink)"};
	${(p) =>
		p.$onHero &&
		/* A white wash over --pc-gradient-hero is illegible at the gold stop
		   (#fff on an 18% white scrim over #F4B400 measures 1.66:1). A dark
		   scrim carries #fff at 7.39:1 against the worst stop. */
		`background: var(--pc-scrim-on-hero);
		 color: #fff;
		 border-color: var(--pc-scrim-on-hero-border);`}
	white-space: nowrap;
`;

const Glyph = styled.span`
	font-size: 9px;
	line-height: 1;
`;

export interface VendorStatusBadgeProps {
	status: VendorStatus;
	/** Tight surfaces (card corners) — shorter copy. */
	compact?: boolean;
	/** Render on the gradient hero, where tone colours have no contrast. */
	onHero?: boolean;
	className?: string;
	/** Announce "Closing soon" changes via a polite live region. Opt-in, and
	 *  only ONE badge per view should set it — a storefront / listing header.
	 *  A feed or directory renders many of these badges at once; making each one
	 *  live means every card re-announces its countdown on the 30s tick, which
	 *  spams the screen-reader. List/card badges therefore stay static. */
	live?: boolean;
}

export function VendorStatusBadge({
	status,
	compact,
	onHero,
	className,
	live: liveProp = false,
}: VendorStatusBadgeProps) {
	const live = liveProp && status.kind === "CLOSING_SOON";
	return (
		<Pill
			className={className}
			$tone={status.tone}
			$kind={status.kind}
			$onHero={onHero}
			aria-label={status.description}
			title={status.description}
			{...(live
				? { role: "status" as const, "aria-live": "polite" as const }
				: {})}
		>
			<Glyph aria-hidden>{status.glyph}</Glyph>
			{compact ? status.compactLabel : status.label}
		</Pill>
	);
}

export default VendorStatusBadge;
