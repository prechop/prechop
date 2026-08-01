"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import styled, { keyframes } from "styled-components";
import { Badge, Button, FadeIn, Loader, Row, Stack, Text } from "@/components";
import { api } from "@/constants/api";
import { formatKobo } from "@/constants/formatters";
import type { BuyerOrder } from "@/types";

type Phase =
	| "checking"
	| "paid"
	| "pending"
	| "failed"
	| "conflict"
	| "refunded";
type PaymentConfirmStatus =
	| "PAYMENT_CONFIRMED"
	| "PAYMENT_PENDING"
	| "PAYMENT_FAILED"
	| "REFERENCE_NOT_FOUND"
	| "AMOUNT_MISMATCH"
	| "CURRENCY_MISMATCH"
	| "MODE_MISMATCH"
	| "ORDER_STATE_CONFLICT";

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
			: "var(--pc-gradient-calm-orange)"};
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

function paidStatus(status: BuyerOrder["status"]): boolean {
	return !["PENDING_PAYMENT", "AWAITING_EXTERNAL_PAYMENT"].includes(status);
}

function failedStatus(status: BuyerOrder["status"]): boolean {
	return ["CANCELLED", "REFUNDED"].includes(status);
}

function refundedStatus(status: BuyerOrder["status"]): boolean {
	return status === "REFUNDED";
}

function rememberedOrderId(reference: string): string | null {
	if (typeof window === "undefined") return null;
	const stored = window.localStorage.getItem(`pch-pay-${reference}`);
	if (!stored) return null;
	try {
		return (
			(JSON.parse(stored) as { buyerOrderId?: string }).buyerOrderId ??
			null
		);
	} catch {
		return null;
	}
}

export default function OrderConfirmationWrapper() {
	const params = useSearchParams();
	const reference = params.get("reference") ?? params.get("trxref") ?? "";

	const [phase, setPhase] = useState<Phase>("checking");
	const [order, setOrder] = useState<BuyerOrder | null>(null);
	const [retryKey, setRetryKey] = useState(0);
	const cancelled = useRef(false);

	const retry = useCallback(() => {
		setPhase("checking");
		setRetryKey((value) => value + 1);
	}, []);

	useEffect(() => {
		cancelled.current = false;
		const attemptKey = retryKey;
		void attemptKey;
		if (!reference) {
			setPhase("failed");
			return;
		}
		const storedBuyerOrderId = rememberedOrderId(reference);

		let polls = 0;
		const tick = async (buyerOrderId: string) => {
			if (cancelled.current) return;
			polls += 1;
			try {
				const res = await api.get(`/orders/${buyerOrderId}`);
				const current = res.data?.data as BuyerOrder;
				setOrder(current);
				if (paidStatus(current.status)) {
					if (refundedStatus(current.status)) {
						setPhase("refunded");
					} else if (failedStatus(current.status)) {
						setPhase("pending");
					} else {
						setPhase("paid");
						window.localStorage.removeItem(`pch-pay-${reference}`);
					}
					return;
				}
			} catch {
				// Keep trying; the callback may outrun cookie refresh or webhook work.
			}
			if (polls >= MAX_POLLS) {
				setPhase("pending");
				return;
			}
			setTimeout(() => tick(buyerOrderId), 2000);
		};

		const confirmThenPoll = async () => {
			try {
				const res = await api.post("/payments/confirm", { reference });
				const confirmed = res.data?.data as {
					status?: PaymentConfirmStatus;
					order?: BuyerOrder;
					retryable?: boolean;
				};
				if (confirmed.order) {
					setOrder(confirmed.order);
				}
				if (confirmed.order && refundedStatus(confirmed.order.status)) {
					setPhase("refunded");
					return;
				}
				switch (confirmed.status) {
					case "PAYMENT_CONFIRMED":
						setPhase("paid");
						window.localStorage.removeItem(`pch-pay-${reference}`);
						return;
					case "PAYMENT_FAILED":
					case "REFERENCE_NOT_FOUND":
						setPhase("failed");
						return;
					case "AMOUNT_MISMATCH":
					case "CURRENCY_MISMATCH":
					case "MODE_MISMATCH":
					case "ORDER_STATE_CONFLICT":
						setPhase("conflict");
						return;
					case "PAYMENT_PENDING":
						if (confirmed.order) tick(confirmed.order.id);
						else setPhase("pending");
						return;
					default:
						setPhase("pending");
						return;
				}
			} catch {
				// Fall back to the locally remembered order id, then to pending.
			}
			if (storedBuyerOrderId) {
				tick(storedBuyerOrderId);
				return;
			}
			setPhase("pending");
		};
		confirmThenPoll();

		return () => {
			cancelled.current = true;
		};
	}, [reference, retryKey]);

	return (
		<Wrap>
			<FadeIn>
				<Panel>
					{phase === "checking" && (
						<Hero $tone="muted">
							<Medallion $tone="muted">
								<Loader size={40} />
							</Medallion>
							<HeroTitle>Confirming payment...</HeroTitle>
							<HeroSub>Confirming your payment...</HeroSub>
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
									will appear in your orders shortly. You can
									retry confirmation safely.
								</HeroSub>
							</Hero>
							<Body>
								<Stack $gap={8}>
									<Button $full $size="lg" onClick={retry}>
										Retry confirmation
									</Button>
									<Button
										as={Link}
										href="/my-orders"
										$full
										$variant="ghost"
									>
										View my orders
									</Button>
								</Stack>
							</Body>
						</>
					)}

					{phase === "conflict" && (
						<>
							<Hero $tone="muted">
								<Medallion $tone="muted">!</Medallion>
								<HeroTitle>Payment needs review</HeroTitle>
								<HeroSub>
									Paystack confirmed activity on this payment,
									but the order needs a support check before
									we can show it as complete.
								</HeroSub>
							</Hero>
							<Body>
								<Stack $gap={8}>
									<Button $full $size="lg" onClick={retry}>
										Check again
									</Button>
									<Button
										as={Link}
										href="/help"
										$full
										$variant="ghost"
									>
										Get help
									</Button>
								</Stack>
							</Body>
						</>
					)}

					{phase === "refunded" && (
						<>
							<Hero $tone="muted">
								<Medallion $tone="muted">R</Medallion>
								<HeroTitle>Payment refunded</HeroTitle>
								<HeroSub>
									Your payment was received, but this order
									could not be completed. The refund has been
									started or processed.
								</HeroSub>
							</Hero>
							<Body>
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
										View order
									</Button>
									<Button
										as={Link}
										href="/help"
										$full
										$variant="ghost"
									>
										Get help
									</Button>
								</Stack>
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
