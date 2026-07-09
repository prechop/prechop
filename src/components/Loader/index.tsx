"use client";

import styled, { keyframes } from "styled-components";

const spin = keyframes`to { transform: rotate(360deg); }`;

const Ring = styled.div<{ $size?: number }>`
	width: ${(p) => p.$size ?? 24}px;
	height: ${(p) => p.$size ?? 24}px;
	border: 3px solid var(--pc-surface-3);
	border-top-color: var(--pc-color-primary);
	border-radius: 50%;
	animation: ${spin} 0.7s linear infinite;
`;

const Center = styled.div<{ $full?: boolean }>`
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 14px;
	width: 100%;
	min-height: ${(p) => (p.$full ? "100dvh" : "40dvh")};
	padding: var(--pc-space-8);
`;

const Brand = styled.div`
	font-family: var(--pc-font-display);
	font-weight: 800;
	font-size: 20px;
	letter-spacing: -0.02em;
	color: var(--pc-color-primary);
`;

export function Loader({ size }: { size?: number }) {
	return <Ring $size={size} />;
}

/**
 * In-page loading placeholder. Pass `full` for route-level loading (auth gates,
 * shell boot) so it fills the whole viewport instead of floating near the top.
 */
export function PageLoader({ full }: { full?: boolean } = {}) {
	return (
		<Center $full={full}>
			<Brand>Prechop</Brand>
			<Ring $size={30} />
		</Center>
	);
}

export default Loader;
