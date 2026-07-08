"use client";

import styled, { css } from "styled-components";

export const Heading = styled.h1<{ $size?: number }>`
	font-size: ${(p) => p.$size ?? 28}px;
	font-weight: 800;
	color: var(--pc-text);
	letter-spacing: -0.02em;
`;

export const Title = styled.h2<{ $size?: number }>`
	font-size: ${(p) => p.$size ?? 20}px;
	font-weight: 700;
	color: var(--pc-text);
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
`;

export const Badge = styled.span<{
	$tone?: "primary" | "success" | "warning" | "danger" | "muted";
}>`
	display: inline-flex;
	align-items: center;
	padding: 3px 10px;
	border-radius: 999px;
	font-size: 12px;
	font-weight: 600;
	${(p) => {
		switch (p.$tone) {
			case "success":
				return css`background: #E7F5EA; color: #2B8A3E;`;
			case "warning":
				return css`background: #FFF3E0; color: #E8590C;`;
			case "danger":
				return css`background: #FDE7E7; color: #E03131;`;
			case "muted":
				return css`background: var(--pc-surface-2); color: var(--pc-text-muted);`;
			default:
				return css`background: var(--pc-color-primary-50); color: var(--pc-color-primary);`;
		}
	}}
`;

export default Text;
