"use client";

import styled, { keyframes } from "styled-components";

const spin = keyframes`to { transform: rotate(360deg); }`;

const Ring = styled.div<{ $size?: number }>`
	width: ${(p) => p.$size ?? 24}px;
	height: ${(p) => p.$size ?? 24}px;
	border: 3px solid var(--pc-surface-2);
	border-top-color: var(--pc-color-primary);
	border-radius: 50%;
	animation: ${spin} 0.7s linear infinite;
`;

const Center = styled.div`
	display: flex;
	align-items: center;
	justify-content: center;
	padding: var(--pc-space-8);
`;

export function Loader({ size }: { size?: number }) {
	return <Ring $size={size} />;
}

export function PageLoader() {
	return (
		<Center>
			<Ring $size={32} />
		</Center>
	);
}

export default Loader;
