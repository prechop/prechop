"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { Button, Card, Loader, Row, Stack, Text, Title } from "@/components";
import { api } from "@/constants/api";
import { formatKobo } from "@/constants/formatters";
import type { BuyerOrder } from "@/types";

type Phase = "checking" | "paid" | "pending" | "failed";

const Wrap = styled(Card)`
	max-width: 460px;
	margin: 40px auto 0;
	text-align: center;
	padding: var(--pc-space-8) var(--pc-space-5);
`;
const Emoji = styled.div`
	font-size: 56px;
	line-height: 1;
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
			{phase === "checking" && (
				<Stack $gap={16}>
					<Row $justify="center">
						<Loader size={40} />
					</Row>
					<Title $size={20}>Confirming your payment…</Title>
					<Text $muted>Hang tight, this only takes a moment.</Text>
				</Stack>
			)}

			{phase === "paid" && (
				<Stack $gap={16}>
					<Emoji>🎉</Emoji>
					<Title $size={22}>Order confirmed!</Title>
					<Text $muted>
						{order
							? `${order.orderNumber} · ${formatKobo(order.totalKobo)} paid.`
							: "Your payment went through."}{" "}
						The kitchen has been notified.
					</Text>
					<Stack $gap={8}>
						<Link
							href={
								order ? `/my-orders/${order.id}` : "/my-orders"
							}
						>
							<Button $full>Track your order</Button>
						</Link>
						<Link href="/marketplace">
							<Button $full $variant="ghost">
								Back to marketplace
							</Button>
						</Link>
					</Stack>
				</Stack>
			)}

			{phase === "pending" && (
				<Stack $gap={16}>
					<Emoji>⏳</Emoji>
					<Title $size={20}>Payment processing</Title>
					<Text $muted>
						We&apos;re still confirming your payment. It will appear
						in your orders shortly.
					</Text>
					<Link href="/my-orders">
						<Button $full>View my orders</Button>
					</Link>
				</Stack>
			)}

			{phase === "failed" && (
				<Stack $gap={16}>
					<Emoji>😕</Emoji>
					<Title $size={20}>Payment not completed</Title>
					<Text $muted>
						Your order wasn&apos;t paid for. You can try again from
						the marketplace.
					</Text>
					<Link href="/marketplace">
						<Button $full>Back to marketplace</Button>
					</Link>
				</Stack>
			)}
		</Wrap>
	);
}
