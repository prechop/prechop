"use client";

import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";
import styled, { keyframes } from "styled-components";

type ToastTone = "success" | "error" | "info";
interface Toast {
	id: number;
	message: string;
	tone: ToastTone;
}

interface ToastCtx {
	toast: (message: string, tone?: ToastTone) => void;
}

const Ctx = createContext<ToastCtx>({ toast: () => {} });

export function useToast(): ToastCtx {
	return useContext(Ctx);
}

const slideIn = keyframes`from { transform: translateY(12px); opacity: 0; } to { transform: translateY(0); opacity: 1; }`;

const Stack = styled.div`
	position: fixed;
	bottom: 20px;
	left: 50%;
	transform: translateX(-50%);
	display: flex;
	flex-direction: column;
	gap: 8px;
	z-index: 9999;
	width: min(92vw, 420px);
`;

const Item = styled.div<{ $tone: ToastTone }>`
	padding: 12px 16px;
	border-radius: var(--pc-radius-sm);
	color: #fff;
	font-size: 14px;
	font-weight: 500;
	box-shadow: var(--pc-shadow-lg);
	animation: ${slideIn} 0.2s ease;
	background: ${(p) =>
		p.$tone === "success"
			? "#2B8A3E"
			: p.$tone === "error"
				? "#E03131"
				: "#201A15"};
`;

let counter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
	const [toasts, setToasts] = useState<Toast[]>([]);

	const toast = useCallback((message: string, tone: ToastTone = "info") => {
		const id = ++counter;
		setToasts((t) => [...t, { id, message, tone }]);
		setTimeout(() => {
			setToasts((t) => t.filter((x) => x.id !== id));
		}, 3800);
	}, []);

	const value = useMemo(() => ({ toast }), [toast]);

	return (
		<Ctx.Provider value={value}>
			{children}
			<Stack>
				{toasts.map((t) => (
					<Item key={t.id} $tone={t.tone}>
						{t.message}
					</Item>
				))}
			</Stack>
		</Ctx.Provider>
	);
}
