"use client";

import styled, { css } from "styled-components";

export const Heading = styled.h1<{ $size?: number }>`
	font-family: var(--pc-font-display);
	font-size: ${(p) => p.$size ?? 30}px;
	font-weight: 800;
	color: var(--pc-text);
	letter-spacing: -0.03em;
	line-height: 1.08;
`;

export const Title = styled.h2<{ $size?: number }>`
	font-family: var(--pc-font-display);
	font-size: ${(p) => p.$size ?? 20}px;
	font-weight: 700;
	color: var(--pc-text);
	letter-spacing: -0.02em;
`;

export const Text = styled.p<{
	$muted?: boolean;
	$size?: number;
	$weight?: number;
}>`
	margin: 0;
	font-size: ${(p) => p.$size ?? 15}px;
	font-weight: ${(p) => p.$weight ?? 400};
	color: ${(p) => (p.$muted ? "var(--pc-text-muted)" : "var(--pc-text)")};
	line-height: 1.55;
`;

export const Badge = styled.span<{
	$tone?: "primary" | "success" | "warning" | "danger" | "muted" | "gold";
}>`
	display: inline-flex;
	align-items: center;
	gap: 5px;
	padding: 4px 11px;
	border-radius: var(--pc-radius-pill);
	font-size: 12px;
	font-weight: 700;
	letter-spacing: -0.01em;
	line-height: 1.4;
	/* Text colour always comes from an *-ink token, never the raw brand hue: at
	   12px/700 on the matching -50 tint the brand hues fail WCAG AA (2.32–4.03).
	   The inks are theme-aware — see --pc-color-*-ink in styles/global.ts. */
	${(p) => {
		switch (p.$tone) {
			case "success":
				return css`background: var(--pc-color-accent-50); color: var(--pc-color-success-ink);`;
			case "warning":
				return css`background: var(--pc-color-gold-50); color: var(--pc-color-warning-ink);`;
			case "gold":
				return css`background: var(--pc-color-gold-50); color: var(--pc-color-gold-ink);`;
			case "danger":
				return css`background: var(--pc-color-danger-50); color: var(--pc-color-danger-ink);`;
			case "muted":
				return css`background: var(--pc-surface-2); color: var(--pc-color-muted-ink);`;
			default:
				return css`background: var(--pc-color-primary-50); color: var(--pc-color-primary-ink);`;
		}
	}}
`;

export default Text;
