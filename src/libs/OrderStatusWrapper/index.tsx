"use client";

import Link from "next/link";
import { useState } from "react";
import styled from "styled-components";
import useSWR from "swr";
import {
	Badge,
	Button,
	Card,
	FadeIn,
	Grid,
	Row,
	Stack,
	StatCard,
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

const STEP_META: Record<string, { icon: string; hint: string }> = {
	PAID: { icon: "💳", hint: "Payment received" },
	CONFIRMED: { icon: "✅", hint: "Kitchen accepted your order" },
	PREPARING: { icon: "🍳", hint: "Your food is being cooked" },
	READY: { icon: "🛎️", hint: "Ready for pickup / on the way" },
	COMPLETED: { icon: "🎉", hint: "Order fulfilled — enjoy!" },
};

const statusTone: Record<
	OrderStatus,
	"primary" | "success" | "warning" | "danger" | "muted"
> = {
	PENDING_PAYMENT: "warning",
	PAID: "primary",
	CONFIRMED: "primary",
	PREPARING: "warning",
	READY: "success",
	COMPLETED: "success",
	CANCELLED: "danger",
	REFUNDED: "muted",
};

const Wrap = styled(Stack)`
	max-width: 560px;
	margin: 0 auto;
`;
const HeroCard = styled(Card)`
	background: var(--pc-gradient-warm);
	border: none;
`;
const Track = styled.div`
	display: flex;
	flex-direction: column;
`;
const Step = styled.div<{ $done: boolean; $current: boolean }>`
	display: grid;
	grid-template-columns: 30px 1fr;
	gap: 12px;
	opacity: ${(p) => (p.$done || p.$current ? 1 : 0.5)};
	transition: opacity var(--pc-dur) var(--pc-ease);
`;
const DotCol = styled.div`
	display: flex;
	flex-direction: column;
	align-items: center;
`;
const Dot = styled.div<{ $done: boolean; $current: boolean }>`
	width: 30px;
	height: 30px;
	border-radius: 50%;
	flex-shrink: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 14px;
	font-weight: 700;
	color: #fff;
	background: ${(p) =>
		p.$done
			? "var(--pc-color-accent)"
			: p.$current
				? "var(--pc-color-primary)"
				: "var(--pc-border)"};
	box-shadow: ${(p) =>
		p.$current ? "0 0 0 4px var(--pc-color-primary-50)" : "none"};
`;
const Conn = styled.div<{ $done: boolean }>`
	flex: 1;
	width: 2px;
	min-height: 22px;
	margin: 2px 0;
	background: ${(p) =>
		p.$done ? "var(--pc-color-accent)" : "var(--pc-border)"};
`;
const StepBody = styled.div`
	padding-bottom: var(--pc-space-4);
`;
const Line = styled(Row)`
	justify-content: space-between;
	font-size: 14px;
`;
const Divider = styled.div`
	border-top: 1px solid var(--pc-border);
	margin: 4px 0;
`;
const Stars = styled.div`
	display: flex;
	gap: 4px;
	font-size: 30px;
	cursor: pointer;
`;
const Star = styled.button<{ $on: boolean }>`
	background: none;
	border: none;
	cursor: pointer;
	padding: 0;
	line-height: 1;
	transition: transform var(--pc-dur) var(--pc-ease), color var(--pc-dur) var(--pc-ease);
	color: ${(p) => (p.$on ? "var(--pc-color-gold)" : "var(--pc-border)")};
	&:hover { transform: scale(1.15); }
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
	const itemCount = data.items.reduce((s, it) => s + it.quantity, 0);

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
			<FadeIn>
				<HeroCard>
					<Row $justify="space-between" $align="flex-start" $gap={12}>
						<Stack $gap={4}>
							<Title $size={24}>{data.orderNumber}</Title>
							<Text $muted $size={13}>
								{formatDateTime(data.createdAt)}
							</Text>
						</Stack>
						<Badge $tone={statusTone[data.status]}>
							{statusLabel(data.status)}
						</Badge>
					</Row>
				</HeroCard>
			</FadeIn>

			<FadeIn $delay={60}>
				<Grid $min={150} $gap={12}>
					<StatCard
						label="Order total"
						value={formatKobo(data.totalKobo)}
						icon="💰"
					/>
					<StatCard
						label="Items"
						value={itemCount}
						icon="🍽️"
						tone="var(--pc-color-accent)"
					/>
					<StatCard
						label="Fulfilment"
						value={
							data.fulfillmentType === "DELIVERY"
								? "Delivery"
								: "Pickup"
						}
						icon={data.fulfillmentType === "DELIVERY" ? "🛵" : "🥡"}
						tone="var(--pc-color-gold)"
					/>
				</Grid>
			</FadeIn>

			{!isTerminalBad && data.status !== "PENDING_PAYMENT" && (
				<FadeIn $delay={120}>
					<Card>
						<Stack $gap={14}>
							<Text $weight={800}>Order progress</Text>
							<Track>
								{FLOW.map((s, i) => {
									const done = currentIdx > i;
									const current = currentIdx === i;
									const meta = STEP_META[s];
									return (
										<Step
											key={s}
											$done={done}
											$current={current}
										>
											<DotCol>
												<Dot
													$done={done}
													$current={current}
												>
													{done ? "✓" : i + 1}
												</Dot>
												{i < FLOW.length - 1 && (
													<Conn $done={done} />
												)}
											</DotCol>
											<StepBody>
												<Text
													$weight={
														current ? 800 : 600
													}
												>
													{meta?.icon}{" "}
													{statusLabel(s)}
												</Text>
												<Text $muted $size={13}>
													{meta?.hint}
												</Text>
											</StepBody>
										</Step>
									);
								})}
							</Track>
						</Stack>
					</Card>
				</FadeIn>
			)}

			{data.status === "PENDING_PAYMENT" && (
				<Card $accent>
					<Row $gap={10} $align="flex-start">
						<Text $size={20}>⏳</Text>
						<Text $muted>
							This order is awaiting payment. If you already paid,
							it will update shortly.
						</Text>
					</Row>
				</Card>
			)}

			<Card>
				<Stack $gap={10}>
					<Text $weight={800}>Receipt</Text>
					{data.items.map((it) => (
						<Stack key={it.dailyOrderItemId} $gap={2}>
							<Line>
								<Text $weight={600}>
									{it.quantity}× {it.snapshotName}
								</Text>
								<Text $weight={600}>
									{formatKobo(it.subtotalKobo)}
								</Text>
							</Line>
							{it.selectedOptions.map((a) => (
								<Line key={`${a.groupName}-${a.snapshotName}`}>
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
					<Divider />
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
					<Divider />
					<Line>
						<Text $weight={800} $size={16}>
							Total
						</Text>
						<Text $weight={800} $size={16}>
							{formatKobo(data.totalKobo)}
						</Text>
					</Line>
				</Stack>
			</Card>

			{data.status === "COMPLETED" && (
				<Card $accent>
					<Stack $gap={12}>
						<Text $weight={800}>Rate this order</Text>
						{existingReview ? (
							<Row $gap={8} $align="center">
								<Text $size={20}>⭐</Text>
								<Text $muted>
									You rated this {existingReview.rating}★.
									Thanks for the feedback!
								</Text>
							</Row>
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
							<Text $weight={800}>Cancel order</Text>
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
					← Back to orders
				</Button>
			</Link>
		</Wrap>
	);
}

function errMsg(e: unknown): string {
	const err = e as { response?: { data?: { message?: string } } };
	return err?.response?.data?.message ?? "Something went wrong. Try again.";
}
