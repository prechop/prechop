"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import styled, { keyframes } from "styled-components";
import { Badge, Button, FadeIn, Loader, Row, Stack, Text } from "@/components";
import { api } from "@/constants/api";
import { formatKobo } from "@/constants/formatters";
import type { BuyerOrder } from "@/types";

type Phase = "checking" | "paid" | "pending" | "failed";

const pop = keyframes`
	0% { transform: scale(0.4); opacity: 0; }
	60% { transform: scale(1.08); opacity: 1; }
	100% { transform: scale(1); opacity: 1; }
`;

const Wrap = styled.div`
	max-width: 480px;
	margin: 24px auto 0;
`;
const Panel = styled.div`
	border-radius: var(--pc-radius-lg);
	overflow: hidden;
	border: 1px solid var(--pc-border);
	box-shadow: var(--pc-shadow-lg);
	background: var(--pc-surface);
`;
const Hero = styled.div<{ $tone?: "warm" | "muted" }>`
	background: ${(p) =>
		p.$tone === "muted"
			? "var(--pc-surface-2)"
			: "var(--pc-gradient-hero)"};
	padding: var(--pc-space-8) var(--pc-space-5) var(--pc-space-6);
	text-align: center;
	color: ${(p) => (p.$tone === "muted" ? "var(--pc-text)" : "#fff")};
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: var(--pc-space-3);
`;
const Medallion = styled.div<{ $tone?: "warm" | "muted" }>`
	width: 84px;
	height: 84px;
	border-radius: 50%;
	display: grid;
	place-items: center;
	font-size: 42px;
	line-height: 1;
	animation: ${pop} 0.5s var(--pc-ease) both;
	background: ${(p) =>
		p.$tone === "muted"
			? "var(--pc-surface-3)"
			: "rgba(255, 255, 255, 0.22)"};
	box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.28);
`;
const HeroTitle = styled.h1`
	font-family: var(--pc-font-display);
	font-size: clamp(24px, 6vw, 30px);
	font-weight: 800;
	letter-spacing: -0.03em;
	margin: 0;
`;
const HeroSub = styled.p`
	margin: 0;
	font-size: 15px;
	opacity: 0.92;
	max-width: 34ch;
	line-height: 1.5;
`;
const Body = styled.div`
	padding: var(--pc-space-5);
`;
const Receipt = styled.div`
	background: var(--pc-surface-2);
	border: 1px solid var(--pc-border);
	border-radius: var(--pc-radius);
	padding: var(--pc-space-4);
`;

const MAX_POLLS = 10;

export default function OrderConfirmationWrapper() {
	const params = useSearchParams();
	const reference = params.get("reference") ?? params.get("trxref") ?? "";

	const [phase, setPhase] = useState<Phase>("checking");
	const [order, setOrder] = useState<BuyerOrder | null>(null);
	const cancelled = useRef(false);

	useEffect(() => {
		cancelled.current = false;
		if (!reference) {
			setPhase("failed");
			return;
		}
		const stored =
			typeof window !== "undefined"
				? window.localStorage.getItem(`pch-pay-${reference}`)
				: null;
		if (!stored) {
			// No local mapping — likely a fresh device. Treat as pending; the
			// webhook still processes payment server-side.
			setPhase("pending");
			return;
		}
		const { buyerOrderId } = JSON.parse(stored) as { buyerOrderId: string };

		let polls = 0;
		const tick = async () => {
			if (cancelled.current) return;
			polls += 1;
			try {
				const res = await api.get(`/orders/${buyerOrderId}`);
				const o = res.data?.data as BuyerOrder;
				setOrder(o);
				if (o.status !== "PENDING_PAYMENT") {
					setPhase(
						o.status === "CANCELLED" || o.status === "REFUNDED"
							? "failed"
							: "paid",
					);
					window.localStorage.removeItem(`pch-pay-${reference}`);
					return;
				}
			} catch {
				// keep trying
			}
			if (polls >= MAX_POLLS) {
				setPhase("pending");
				return;
			}
			setTimeout(tick, 2000);
		};
		tick();

		return () => {
			cancelled.current = true;
		};
	}, [reference]);

	return (
		<Wrap>
			<FadeIn>
				<Panel>
					{phase === "checking" && (
						<Hero $tone="muted">
							<Medallion $tone="muted">
								<Loader size={40} />
							</Medallion>
							<HeroTitle>Confirming payment…</HeroTitle>
							<HeroSub>
								Hang tight, this only takes a moment.
							</HeroSub>
						</Hero>
					)}

					{phase === "paid" && (
						<>
							<Hero>
								<Medallion>🎉</Medallion>
								<HeroTitle>Order confirmed!</HeroTitle>
								<HeroSub>
									The kitchen has been notified and is firing
									up the pot.
								</HeroSub>
							</Hero>
							<Body>
								<Stack $gap={16}>
									{order && (
										<Receipt>
											<Stack $gap={10}>
												<Row $justify="space-between">
													<Text $muted $size={13}>
														Order
													</Text>
													<Text $weight={800}>
														{order.orderNumber}
													</Text>
												</Row>
												<Row $justify="space-between">
													<Text $muted $size={13}>
														Amount paid
													</Text>
													<Text $weight={800}>
														{formatKobo(
															order.totalKobo,
														)}
													</Text>
												</Row>
												<Row $justify="space-between">
													<Text $muted $size={13}>
														Status
													</Text>
													<Badge $tone="success">
														Paid
													</Badge>
												</Row>
											</Stack>
										</Receipt>
									)}
									<Stack $gap={8}>
										<Button
											as={Link}
											href={
												order
													? `/my-orders/${order.id}`
													: "/my-orders"
											}
											$full
											$size="lg"
										>
											Track your order →
										</Button>
										<Button
											as={Link}
											href="/marketplace"
											$full
											$variant="ghost"
										>
											Back to marketplace
										</Button>
									</Stack>
								</Stack>
							</Body>
						</>
					)}

					{phase === "pending" && (
						<>
							<Hero $tone="muted">
								<Medallion $tone="muted">⏳</Medallion>
								<HeroTitle>Payment processing</HeroTitle>
								<HeroSub>
									We&apos;re still confirming your payment. It
									will appear in your orders shortly.
								</HeroSub>
							</Hero>
							<Body>
								<Button
									as={Link}
									href="/my-orders"
									$full
									$size="lg"
								>
									View my orders
								</Button>
							</Body>
						</>
					)}

					{phase === "failed" && (
						<>
							<Hero $tone="muted">
								<Medallion $tone="muted">😕</Medallion>
								<HeroTitle>Payment not completed</HeroTitle>
								<HeroSub>
									Your order wasn&apos;t paid for. You can try
									again from the marketplace.
								</HeroSub>
							</Hero>
							<Body>
								<Button
									as={Link}
									href="/marketplace"
									$full
									$size="lg"
								>
									Back to marketplace
								</Button>
							</Body>
						</>
					)}
				</Panel>
			</FadeIn>
		</Wrap>
	);
}
