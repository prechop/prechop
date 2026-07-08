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
	${(p) => {
		switch (p.$tone) {
			case "success":
				return css`background: var(--pc-color-accent-50); color: var(--pc-color-accent);`;
			case "warning":
				return css`background: var(--pc-color-gold-50); color: var(--pc-color-warning);`;
			case "gold":
				return css`background: var(--pc-color-gold-50); color: #9a7400;`;
			case "danger":
				return css`background: var(--pc-color-danger-50); color: var(--pc-color-danger);`;
			case "muted":
				return css`background: var(--pc-surface-2); color: var(--pc-text-muted);`;
			default:
				return css`background: var(--pc-color-primary-50); color: var(--pc-color-primary);`;
		}
	}}
`;

export default Text;
