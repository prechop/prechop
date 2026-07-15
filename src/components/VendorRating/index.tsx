"use client";

/**
 * Public rating display — PRD §8.6 / §8.12.
 *
 * The rule this primitive exists to enforce: a vendor's numeric rating is a
 * public trust signal, and a score computed from one or two reviews is not a
 * trust signal — it is a gameable one. Today a single 5-star review renders
 * "⭐ 5.0" on the storefront, the marketplace and search results. Below the
 * threshold this component renders "New vendor" and NO number at all — not a
 * greyed-out number, not a number in a tooltip.
 *
 * Every public surface must render ratings through this component. If you find
 * yourself writing `rating.toFixed(1)` in a wrapper, that is the bug.
 *
 * "New vendor" is a trust badge and is orthogonal to availability
 * (see ../VendorStatus) — a vendor can be both "New vendor" and "Closing soon".
 * Render them side by side, trust badge last.
 */

import styled from "styled-components";
import { Badge, Text } from "../Text";

/**
 * Reviews required before a numeric score is shown publicly.
 *
 * NOTE: PRD §8.6 says "fewer than 5 completed orders" while §8.12 says
 * "Minimum 5 completed reviews". Those are different gates. This implements
 * REVIEWS (§8.12), because the score is an average of reviews — gating it on
 * order count would let a vendor with 50 orders and 1 review show a 5.0.
 */
export const MIN_PUBLIC_RATING_REVIEWS = 5;

/** True when the numeric score may be shown publicly. */
export function shouldShowPublicRating(totalReviews: number | null | undefined) {
	return (totalReviews ?? 0) >= MIN_PUBLIC_RATING_REVIEWS;
}

const NEW_VENDOR_LABEL = "New vendor";
const NEW_VENDOR_HINT = "Rating shows after 5 reviews";

const Wrap = styled.span<{ $onHero?: boolean }>`
	display: inline-flex;
	align-items: center;
	gap: 6px;
	font-size: 13px;
	font-weight: 700;
	color: ${(p) => (p.$onHero ? "rgba(255,255,255,0.92)" : "var(--pc-text)")};
	white-space: nowrap;
`;

const Star = styled.span`
	color: var(--pc-color-gold);
	font-size: 13px;
	line-height: 1;
`;

const Count = styled.span<{ $onHero?: boolean }>`
	font-weight: 600;
	color: ${(p) => (p.$onHero ? "rgba(255,255,255,0.8)" : "var(--pc-text-muted)")};
`;

const NewPill = styled(Badge)<{ $onHero?: boolean }>`
	border: 1px dashed currentColor;
	${(p) =>
		p.$onHero &&
		`background: rgba(255,255,255,0.18); color: #fff; border-color: rgba(255,255,255,0.55);`}
`;

export interface VendorRatingProps {
	rating: number | null | undefined;
	totalReviews: number | null | undefined;
	/** Render on the gradient hero, where token colours have no contrast. */
	onHero?: boolean;
	/** Hide the "(12)" review count — for very tight surfaces. */
	hideCount?: boolean;
	className?: string;
}

/**
 * Renders EITHER the numeric score (≥5 reviews) OR the "New vendor" badge.
 * Never both, never a number below the threshold.
 */
export function VendorRating({
	rating,
	totalReviews,
	onHero,
	hideCount,
	className,
}: VendorRatingProps) {
	const count = totalReviews ?? 0;

	if (!shouldShowPublicRating(count)) {
		return (
			<NewPill
				className={className}
				$tone="muted"
				$onHero={onHero}
				aria-label={`${NEW_VENDOR_LABEL} — ${NEW_VENDOR_HINT.toLowerCase()}`}
				title={NEW_VENDOR_HINT}
			>
				<span aria-hidden>✦</span>
				{NEW_VENDOR_LABEL}
			</NewPill>
		);
	}

	const score = (rating ?? 0).toFixed(1);
	return (
		<Wrap
			className={className}
			$onHero={onHero}
			aria-label={`Rated ${score} out of 5 from ${count} reviews`}
		>
			<Star aria-hidden>★</Star>
			{score}
			{!hideCount && (
				<Count $onHero={onHero} aria-hidden>
					({count})
				</Count>
			)}
		</Wrap>
	);
}

/**
 * The "New vendor" trust badge on its own — for surfaces that show the badge
 * row without a rating slot. Renders nothing once the vendor has enough
 * reviews, so it is safe to drop into a badge row unconditionally.
 */
export function NewVendorBadge({
	totalReviews,
	onHero,
	className,
}: {
	totalReviews: number | null | undefined;
	onHero?: boolean;
	className?: string;
}) {
	if (shouldShowPublicRating(totalReviews)) return null;
	return (
		<NewPill
			className={className}
			$tone="muted"
			$onHero={onHero}
			aria-label={`${NEW_VENDOR_LABEL} — ${NEW_VENDOR_HINT.toLowerCase()}`}
			title={NEW_VENDOR_HINT}
		>
			<span aria-hidden>✦</span>
			{NEW_VENDOR_LABEL}
		</NewPill>
	);
}

/** Explanatory line for the storefront reviews section when below threshold. */
export function RatingThresholdNote({
	totalReviews,
}: {
	totalReviews: number | null | undefined;
}) {
	const count = totalReviews ?? 0;
	if (shouldShowPublicRating(count)) return null;
	const left = MIN_PUBLIC_RATING_REVIEWS - count;
	return (
		<Text $muted $size={13}>
			{count === 0
				? "No reviews yet — be the first to rate this kitchen."
				: `${count} review${count === 1 ? "" : "s"} so far. A public rating shows after ${MIN_PUBLIC_RATING_REVIEWS} — ${left} to go.`}
		</Text>
	);
}

export default VendorRating;
