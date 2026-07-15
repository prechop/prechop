"use client";

import {
	type ButtonHTMLAttributes,
	type ElementType,
	forwardRef,
	type Ref,
} from "react";
import styled, { css } from "styled-components";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "gold" | "accent";
type Size = "sm" | "md" | "lg";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
	$variant?: Variant;
	$size?: Size;
	$full?: boolean;
	$pill?: boolean;
	$loading?: boolean;
	/** Render as another element (e.g. `as={Link}` for a styled anchor) so a CTA
	 *  is ONE interactive element, never a <button> nested inside an <a>. */
	as?: ElementType;
	/** Anchor attributes, present only when rendered `as={Link}` / an anchor. */
	href?: string;
	target?: string;
	rel?: string;
}

// White-on-fill labels: the solid variants use the darkened `--pc-btn-*` fill
// tokens (see styles/global.ts) so 15px/700 white text clears WCAG AA 4.5:1.
// The primary/accent hovers stay within the passing range (measured), and the
// danger hover only darkens.
const variants = {
	primary: css`
		background: var(--pc-btn-primary-bg);
		color: var(--pc-text-inverse);
		box-shadow: var(--pc-shadow-primary);
		&:hover:not(:disabled) { filter: brightness(1.04); box-shadow: 0 12px 30px rgba(255, 90, 31, 0.38); }
	`,
	accent: css`
		background: var(--pc-btn-accent-bg);
		color: #fff;
		&:hover:not(:disabled) { filter: brightness(1.06); }
	`,
	gold: css`
		background: var(--pc-color-gold);
		color: #3a2c00;
		&:hover:not(:disabled) { filter: brightness(1.05); }
	`,
	secondary: css`
		background: var(--pc-surface);
		color: var(--pc-text);
		border: 1px solid var(--pc-border);
		&:hover:not(:disabled) { background: var(--pc-surface-2); border-color: var(--pc-text-faint); }
	`,
	ghost: css`
		background: transparent;
		color: var(--pc-text);
		&:hover:not(:disabled) { background: var(--pc-surface-2); }
	`,
	danger: css`
		background: var(--pc-btn-danger-bg);
		color: #fff;
		&:hover:not(:disabled) { filter: brightness(0.94); }
	`,
};

const sizes = {
	sm: css`
		padding: 8px 14px;
		font-size: 13px;
	`,
	md: css`
		padding: 11px 20px;
		font-size: 15px;
	`,
	lg: css`
		padding: 15px 28px;
		font-size: 16px;
	`,
};

const StyledButton = styled.button<Props>`
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	border: none;
	border-radius: ${(p) => (p.$pill ? "var(--pc-radius-pill)" : "var(--pc-radius-sm)")};
	font-weight: 700;
	font-family: inherit;
	letter-spacing: -0.01em;
	cursor: pointer;
	transition: transform var(--pc-dur) var(--pc-ease), filter var(--pc-dur) var(--pc-ease),
		background var(--pc-dur) var(--pc-ease), box-shadow var(--pc-dur) var(--pc-ease);
	white-space: nowrap;
	width: ${(p) => (p.$full ? "100%" : "auto")};
	${(p) => variants[p.$variant ?? "primary"]}
	${(p) => sizes[p.$size ?? "md"]}
	&:active:not(:disabled) { transform: translateY(1px) scale(0.99); }
	&:disabled { opacity: 0.55; cursor: not-allowed; box-shadow: none; }
`;

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
	{ children, $loading, disabled, as, ...rest },
	ref,
) {
	// When rendered as a link (`as={Link}`) the element is an <a>, which has no
	// `disabled` attribute — express the unavailable state with `aria-disabled`
	// instead. As a real <button>, keep the native `disabled`.
	const isLink = as !== undefined;
	const isDisabled = disabled || $loading;
	return (
		<StyledButton
			ref={ref as Ref<HTMLButtonElement>}
			as={as}
			disabled={isLink ? undefined : isDisabled}
			aria-disabled={isLink && isDisabled ? true : undefined}
			{...rest}
		>
			{$loading ? "Please wait…" : children}
		</StyledButton>
	);
});

export default Button;
