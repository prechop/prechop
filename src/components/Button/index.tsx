"use client";

import type { ButtonHTMLAttributes } from "react";
import styled, { css } from "styled-components";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
	$variant?: Variant;
	$size?: Size;
	$full?: boolean;
	$loading?: boolean;
}

const variants = {
	primary: css`
		background: var(--pc-color-primary);
		color: var(--pc-text-inverse);
		&:hover:not(:disabled) { background: var(--pc-color-primary-600); }
	`,
	secondary: css`
		background: var(--pc-surface-2);
		color: var(--pc-text);
		&:hover:not(:disabled) { background: var(--pc-border); }
	`,
	ghost: css`
		background: transparent;
		color: var(--pc-text);
		&:hover:not(:disabled) { background: var(--pc-surface-2); }
	`,
	danger: css`
		background: var(--pc-color-danger);
		color: #fff;
		&:hover:not(:disabled) { filter: brightness(0.94); }
	`,
};

const sizes = {
	sm: css`
		padding: 6px 12px;
		font-size: 13px;
	`,
	md: css`
		padding: 10px 18px;
		font-size: 15px;
	`,
	lg: css`
		padding: 14px 24px;
		font-size: 16px;
	`,
};

const StyledButton = styled.button<Props>`
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	border: none;
	border-radius: var(--pc-radius-sm);
	font-weight: 600;
	cursor: pointer;
	transition: background 0.15s ease, filter 0.15s ease;
	white-space: nowrap;
	width: ${(p) => (p.$full ? "100%" : "auto")};
	${(p) => variants[p.$variant ?? "primary"]}
	${(p) => sizes[p.$size ?? "md"]}
	&:disabled { opacity: 0.55; cursor: not-allowed; }
`;

export function Button({ children, $loading, disabled, ...rest }: Props) {
	return (
		<StyledButton disabled={disabled || $loading} {...rest}>
			{$loading ? "Please wait…" : children}
		</StyledButton>
	);
}

export default Button;
