"use client";

import Link from "next/link";
import { useState } from "react";
import styled from "styled-components";
import useSWR from "swr";
import {
	Badge,
	Button,
	Card,
	Row,
	Stack,
	Text,
	Textarea,
	Title,
} from "@/components";
import { PageLoader } from "@/components/Loader";
import { api } from "@/constants/api";
import { fetcher } from "@/constants/fetcher";
import {
	formatDateTime,
	formatKobo,
	statusLabel,
} from "@/constants/formatters";
import { useToast } from "@/hooks/useToast";
import type { BuyerOrder, OrderStatus } from "@/types";

// Happy-path progression shown as a timeline (terminal states handled apart).
const FLOW: OrderStatus[] = [
	"PAID",
	"CONFIRMED",
	"PREPARING",
	"READY",
	"COMPLETED",
];
const CANCELLABLE: OrderStatus[] = ["PENDING_PAYMENT", "PAID", "CONFIRMED"];

const Wrap = styled(Stack)`
	max-width: 560px;
	margin: 0 auto;
`;
const Step = styled.div<{ $done: boolean; $current: boolean }>`
	display: flex;
	align-items: center;
	gap: 12px;
	opacity: ${(p) => (p.$done || p.$current ? 1 : 0.4)};
`;
const Dot = styled.div<{ $done: boolean; $current: boolean }>`
	width: 26px;
	height: 26px;
	border-radius: 50%;
	flex-shrink: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 13px;
	color: #fff;
	background: ${(p) =>
		p.$done
			? "var(--pc-color-success, #2B8A3E)"
			: p.$current
				? "var(--pc-color-primary)"
				: "var(--pc-border)"};
`;
const Line = styled(Row)`
	justify-content: space-between;
	font-size: 14px;
`;
const Stars = styled.div`
	display: flex;
	gap: 4px;
	font-size: 28px;
	cursor: pointer;
`;
const Star = styled.button<{ $on: boolean }>`
	background: none;
	border: none;
	cursor: pointer;
	padding: 0;
	line-height: 1;
	color: ${(p) => (p.$on ? "#F59F00" : "var(--pc-border)")};
`;

export default function OrderStatusWrapper({ orderId }: { orderId: string }) {
	const { toast } = useToast();
	const { data, isLoading, mutate } = useSWR<BuyerOrder>(
		`/orders/${orderId}`,
		fetcher,
		{ refreshInterval: 20_000 },
	);
	const { data: existingReview, mutate: mutateReview } = useSWR<{
		id: string;
		rating: number;
	} | null>(`/orders/${orderId}/review`, fetcher);

	const [cancelling, setCancelling] = useState(false);
	const [reason, setReason] = useState("");
	const [showCancel, setShowCancel] = useState(false);
	const [rating, setRating] = useState(0);
	const [comment, setComment] = useState("");
	const [submitting, setSubmitting] = useState(false);

	if (isLoading) return <PageLoader />;
	if (!data) {
		return (
			<Wrap>
				<Card>
					<Text $muted>Order not found.</Text>
				</Card>
			</Wrap>
		);
	}

	const isTerminalBad =
		data.status === "CANCELLED" || data.status === "REFUNDED";
	const currentIdx = FLOW.indexOf(data.status);

	async function cancel() {
		if (!reason.trim()) {
			toast("Tell us why you're cancelling.", "error");
			return;
		}
		setCancelling(true);
		try {
			await api.post(`/orders/${orderId}/cancel`, {
				reason: reason.trim(),
			});
			toast("Order cancelled.", "success");
			setShowCancel(false);
			await mutate();
		} catch (e) {
			toast(errMsg(e), "error");
		} finally {
			setCancelling(false);
		}
	}

	async function submitReview() {
		if (rating < 1) {
			toast("Pick a star rating.", "error");
			return;
		}
		setSubmitting(true);
		try {
			await api.post("/reviews", {
				buyerOrderId: orderId,
				rating,
				comment: comment.trim() || undefined,
			});
			toast("Thanks for your review!", "success");
			await mutateReview();
		} catch (e) {
			toast(errMsg(e), "error");
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<Wrap $gap={16}>
			<Row $justify="space-between" $align="flex-start">
				<Stack $gap={2}>
					<Title $size={22}>{data.orderNumber}</Title>
					<Text $muted $size={13}>
						{formatDateTime(data.createdAt)}
					</Text>
				</Stack>
				<Badge $tone={isTerminalBad ? "danger" : "primary"}>
					{statusLabel(data.status)}
				</Badge>
			</Row>

			{!isTerminalBad && data.status !== "PENDING_PAYMENT" && (
				<Card>
					<Stack $gap={14}>
						{FLOW.map((s, i) => {
							const done = currentIdx > i;
							const current = currentIdx === i;
							return (
								<Step key={s} $done={done} $current={current}>
									<Dot $done={done} $current={current}>
										{done ? "✓" : i + 1}
									</Dot>
									<Text $weight={current ? 700 : 400}>
										{statusLabel(s)}
									</Text>
								</Step>
							);
						})}
					</Stack>
				</Card>
			)}

			{data.status === "PENDING_PAYMENT" && (
				<Card>
					<Text $muted>
						This order is awaiting payment. If you already paid, it
						will update shortly.
					</Text>
				</Card>
			)}

			<Card>
				<Stack $gap={10}>
					<Text $weight={700}>Items</Text>
					{data.items.map((it) => (
						<Stack key={it.dailyOrderItemId} $gap={2}>
							<Line>
								<Text>
									{it.quantity}× {it.snapshotName}
								</Text>
								<Text>{formatKobo(it.subtotalKobo)}</Text>
							</Line>
							{it.addons.map((a) => (
								<Line key={a.snapshotName}>
									<Text $muted $size={13}>
										+ {a.snapshotName}
									</Text>
									<Text $muted $size={13}>
										{formatKobo(a.subtotalKobo)}
									</Text>
								</Line>
							))}
						</Stack>
					))}
					<div
						style={{
							borderTop: "1px solid var(--pc-border)",
							margin: "4px 0",
						}}
					/>
					<Line>
						<Text $muted>Subtotal</Text>
						<Text>{formatKobo(data.subtotalKobo)}</Text>
					</Line>
					{data.deliveryFeeKobo > 0 && (
						<Line>
							<Text $muted>Delivery</Text>
							<Text>{formatKobo(data.deliveryFeeKobo)}</Text>
						</Line>
					)}
					<Line>
						<Text $muted>Service fee</Text>
						<Text>{formatKobo(data.platformFeeKobo)}</Text>
					</Line>
					<Line>
						<Text $weight={800}>Total</Text>
						<Text $weight={800}>{formatKobo(data.totalKobo)}</Text>
					</Line>
					<Text $muted $size={13}>
						{data.fulfillmentType === "DELIVERY"
							? "Delivery"
							: "Pickup"}
					</Text>
				</Stack>
			</Card>

			{data.status === "COMPLETED" && (
				<Card>
					<Stack $gap={12}>
						<Text $weight={700}>Rate this order</Text>
						{existingReview ? (
							<Text $muted>
								You rated this {existingReview.rating}★. Thanks
								for the feedback!
							</Text>
						) : (
							<>
								<Stars>
									{[1, 2, 3, 4, 5].map((n) => (
										<Star
											key={n}
											$on={n <= rating}
											onClick={() => setRating(n)}
											aria-label={`${n} star`}
										>
											★
										</Star>
									))}
								</Stars>
								<Textarea
									label="Comment (optional)"
									value={comment}
									onChange={(e) => setComment(e.target.value)}
									placeholder="How was the food?"
								/>
								<Button
									$loading={submitting}
									onClick={submitReview}
								>
									Submit review
								</Button>
							</>
						)}
					</Stack>
				</Card>
			)}

			{CANCELLABLE.includes(data.status) &&
				(showCancel ? (
					<Card>
						<Stack $gap={12}>
							<Text $weight={700}>Cancel order</Text>
							<Textarea
								label="Reason"
								value={reason}
								onChange={(e) => setReason(e.target.value)}
								placeholder="Changed my mind…"
							/>
							<Row $gap={10}>
								<Button
									$variant="danger"
									$loading={cancelling}
									onClick={cancel}
								>
									Confirm cancel
								</Button>
								<Button
									$variant="ghost"
									onClick={() => setShowCancel(false)}
								>
									Keep order
								</Button>
							</Row>
						</Stack>
					</Card>
				) : (
					<Button
						$variant="ghost"
						onClick={() => setShowCancel(true)}
					>
						Cancel order
					</Button>
				))}

			<Link href="/my-orders">
				<Button $full $variant="secondary">
					Back to orders
				</Button>
			</Link>
		</Wrap>
	);
}

function errMsg(e: unknown): string {
	const err = e as { response?: { data?: { message?: string } } };
	return err?.response?.data?.message ?? "Something went wrong. Try again.";
}
