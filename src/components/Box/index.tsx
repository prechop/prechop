"use client";

import styled from "styled-components";

export const Box = styled.div``;

export const Container = styled.div`
	width: 100%;
	max-width: var(--pc-maxw);
	margin: 0 auto;
	padding: 0 var(--pc-space-4);
`;

export const Card = styled.div`
	background: var(--pc-surface);
	border: 1px solid var(--pc-border);
	border-radius: var(--pc-radius);
	box-shadow: var(--pc-shadow);
	padding: var(--pc-space-5);
`;

export const Row = styled.div<{
	$gap?: number;
	$justify?: string;
	$align?: string;
	$wrap?: boolean;
}>`
	display: flex;
	gap: ${(p) => p.$gap ?? 12}px;
	justify-content: ${(p) => p.$justify ?? "flex-start"};
	align-items: ${(p) => p.$align ?? "center"};
	flex-wrap: ${(p) => (p.$wrap ? "wrap" : "nowrap")};
`;

export const Stack = styled.div<{ $gap?: number }>`
	display: flex;
	flex-direction: column;
	gap: ${(p) => p.$gap ?? 12}px;
`;

export const Grid = styled.div<{ $min?: number; $gap?: number }>`
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(${(p) => p.$min ?? 240}px, 1fr));
	gap: ${(p) => p.$gap ?? 16}px;
`;

export default Box;
