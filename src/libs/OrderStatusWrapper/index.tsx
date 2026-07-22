"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import styled from "styled-components";
import useSWR from "swr";
import {
	Badge,
	Button,
	Card,
	FadeIn,
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
import { ReceiptCard, RefundNote } from "@/libs/ReceiptCard";
import { OrderAgainButton } from "@/libs/ReorderSheet";
import type { BuyerOrder, OrderStatus } from "@/types";

// Happy-path progression shown as a timeline (terminal states handled apart).
const BASE_FLOW: OrderStatus[] = [
	"AWAITING_VENDOR_ACCEPTANCE",
	"COOKING",
	"READY",
	"COMPLETED",
];
const CANCELLABLE: OrderStatus[] = [
	"PENDING_PAYMENT",
	"AWAITING_EXTERNAL_PAYMENT",
	"PAID",
	"AWAITING_VENDOR_ACCEPTANCE",
	"ACCEPTED",
	"CONFIRMED",
];

const STEP_META: Record<string, { icon: string; hint: string }> = {
	PAID: { icon: "💳", hint: "Payment received" },
	CONFIRMED: { icon: "✅", hint: "Kitchen accepted your order" },
	PREPARING: { icon: "🍳", hint: "Your food is being cooked" },
	READY: { icon: "🛎️", hint: "Ready for pickup / on the way" },
	COMPLETED: { icon: "🎉", hint: "Order fulfilled — enjoy!" },
};

STEP_META.IN_TRANSIT = { icon: "->", hint: "Your order is on the way" };
STEP_META.AWAITING_BUYER_NO_SHOW_RESPONSE = {
	icon: "!",
	hint: "Please respond to the pickup report",
};
STEP_META.COMPLETED_BUYER_NO_SHOW = {
	icon: "OK",
	hint: "Closed as buyer no-show",
};
STEP_META.PICKUP_PROBLEM_REPORTED = {
	icon: "!",
	hint: "Pickup problem sent for review",
};
STEP_META.BUYER_UNREACHABLE_REPORTED = {
	icon: "!",
	hint: "The vendor could not reach you",
};
STEP_META.DELIVERY_FAILED = {
	icon: "!",
	hint: "Delivery failed and is under review",
};
STEP_META.AWAITING_VENDOR_ACCEPTANCE = {
	icon: "!",
	hint: "Waiting for the kitchen to accept",
};
STEP_META.COOKING = { icon: "...", hint: "Your food is being cooked" };
STEP_META.PICKED_UP = { icon: "OK", hint: "Pickup confirmed" };
STEP_META.DELIVERED = { icon: "OK", hint: "Delivery confirmed" };

const statusTone: Record<
	OrderStatus,
	"primary" | "success" | "warning" | "danger" | "muted"
> = {
	PENDING_PAYMENT: "warning",
	AWAITING_EXTERNAL_PAYMENT: "warning",
	PAID: "primary",
	AWAITING_VENDOR_ACCEPTANCE: "warning",
	ACCEPTED: "primary",
	CONFIRMED: "primary",
	COOKING: "warning",
	PREPARING: "warning",
	READY: "success",
	IN_TRANSIT: "success",
	AWAITING_BUYER_NO_SHOW_RESPONSE: "warning",
	COMPLETED_BUYER_NO_SHOW: "success",
	PICKUP_PROBLEM_REPORTED: "warning",
	BUYER_UNREACHABLE_REPORTED: "warning",
	DELIVERY_FAILED: "danger",
	PICKED_UP: "success",
	DELIVERED: "success",
	COMPLETED: "success",
	VENDOR_REJECTED: "danger",
	EXPIRED_VENDOR_NO_RESPONSE: "danger",
	REFUND_PENDING: "warning",
	REFUND_PROCESSING: "warning",
	REFUND_FAILED: "danger",
	CANCELLED: "danger",
	REFUNDED: "muted",
};

const Wrap = styled(Stack)`
	max-width: 560px;
	margin: 0 auto;
`;
const HeroCard = styled(Card)`
	background: var(--pc-gradient-calm-orange);
	border: none;
`;
const SummaryGrid = styled.div`
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 8px;
	width: 100%;

	@media (max-width: 340px) {
		grid-template-columns: repeat(auto-fit, minmax(104px, 1fr));
	}

	> div {
		min-width: 0;
		padding: 12px 10px;
		gap: 6px;
	}

	> div > div:first-child {
		min-width: 0;
		gap: 6px;
	}

	> div > div:first-child > span:first-child {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 11.5px;
		font-weight: 800;
		line-height: 1.15;
	}

	> div > div:first-child > span:last-child {
		flex: 0 0 auto;
		font-size: 15px;
	}

	> div > div:nth-child(2) {
		min-width: 0;
		overflow-wrap: anywhere;
		font-size: 20px;
		font-weight: 900;
		letter-spacing: 0;
		line-height: 1.05;
	}

	@media (min-width: 390px) {
		> div > div:nth-child(2) {
			font-size: 22px;
		}
	}
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
const FulfillmentCard = styled(Card)`
	margin-top: 12px;
	padding: var(--pc-space-4);
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
	const canViewHandover =
		data?.handoverCredentialUsedAt == null &&
		((data?.fulfillmentType === "PICKUP" && data.status === "READY") ||
			(data?.fulfillmentType === "DELIVERY" &&
				data.status === "IN_TRANSIT"));
	const { data: handover } = useSWR<{
		qrDataUrl: string;
		pin: string;
	}>(canViewHandover ? `/orders/${orderId}/handover` : null, fetcher);

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
	const flow =
		data.fulfillmentType === "DELIVERY"
			? BASE_FLOW.flatMap((status) =>
					status === "COMPLETED"
						? ([
								"IN_TRANSIT",
								"DELIVERED",
								"COMPLETED",
							] as OrderStatus[])
						: [status],
				)
			: BASE_FLOW.flatMap((status) =>
					status === "COMPLETED"
						? (["PICKED_UP", "COMPLETED"] as OrderStatus[])
						: [status],
				);
	const currentIdx = flow.indexOf(data.status);
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
				<SummaryGrid>
					<StatCard
						label="Total"
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
						label="Mode"
						value={
							data.fulfillmentType === "DELIVERY"
								? "Delivery"
								: "Pickup"
						}
						icon={data.fulfillmentType === "DELIVERY" ? "🛵" : "🥡"}
						tone="var(--pc-color-gold)"
					/>
				</SummaryGrid>
				{data.fulfillmentType === "PICKUP" && (
					<FulfillmentCard>
						<Row $gap={12} $align="flex-start">
							<Stack $gap={4}>
								<Text $weight={800}>Pickup location</Text>
								<Text $muted $size={14}>
									{data.vendorPickupLocation ??
										"Kitchen has not added a pickup spot yet."}
								</Text>
							</Stack>
						</Row>
					</FulfillmentCard>
				)}
				{data.fulfillmentType === "DELIVERY" && (
					<FulfillmentCard>
						<Stack $gap={10}>
							<Stack $gap={4}>
								<Text $weight={800}>
									Delivery fulfilled by the vendor
								</Text>
								<Text $muted $size={14}>
									Prechop manages payment and order status,
									but this kitchen is responsible for
									arranging and completing delivery. Delivery
									complaints are reviewed with the vendor by
									support.
								</Text>
							</Stack>
							<Row $justify="flex-start">
								<Button
									as={Link}
									href={`/help?audience=buyer&category=ORDER&order=${encodeURIComponent(data.orderNumber)}#support-form`}
									$variant="secondary"
									$size="sm"
								>
									Report delivery issue
								</Button>
							</Row>
						</Stack>
					</FulfillmentCard>
				)}
			</FadeIn>

			{!isTerminalBad && data.status !== "PENDING_PAYMENT" && (
				<FadeIn $delay={120}>
					<Card>
						<Stack $gap={14}>
							<Text $weight={800}>Order progress</Text>
							<Track>
								{flow.map((s, i) => {
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
												{i < flow.length - 1 && (
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

			{canViewHandover && handover && (
				<Card $accent>
					<Stack $gap={12}>
						<Text $weight={800}>Handover confirmation</Text>
						<Row $gap={14} $align="center">
							<Image
								src={handover.qrDataUrl}
								alt="Order confirmation QR code"
								width={160}
								height={160}
								unoptimized
								style={{ borderRadius: 8 }}
							/>
							<Stack $gap={4}>
								<Text $muted $size={13}>
									Show this QR code to the vendor.
								</Text>
								<Text $weight={900} $size={28}>
									{handover.pin}
								</Text>
								<Text $muted $size={13}>
									Use the PIN only if scanning does not work.
								</Text>
							</Stack>
						</Row>
					</Stack>
				</Card>
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
					{/* Not a receipt — it's the live price breakdown, and it
					    renders long before any money is settled. The actual
					    downloadable receipt is <ReceiptCard> below. */}
					<Text $weight={800}>Order summary</Text>
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
						<Text>
							{formatKobo(
								data.paymentProcessingFeeKobo ??
									data.platformFeeKobo,
							)}
						</Text>
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

			{/* COMPLETED only — a receipt for an unfulfilled order documents
			    something that didn't happen. Cancelled/refunded get a note. */}
			{data.status === "COMPLETED" && (
				<ReceiptCard
					orderId={orderId}
					receiptStatus={data.receiptStatus}
				/>
			)}
			{isTerminalBad && (
				<RefundNote refunded={data.status === "REFUNDED"} />
			)}

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

			{/* Primary, so it doesn't read as a twin of the secondary
			    "Back to orders" directly beneath it. */}
			{data.status === "COMPLETED" && (
				<OrderAgainButton
					orderId={orderId}
					$variant="primary"
					$full
					$size="lg"
				/>
			)}

			<Button as={Link} href="/my-orders" $full $variant="secondary">
				← Back to orders
			</Button>
		</Wrap>
	);
}

function errMsg(e: unknown): string {
	const err = e as { response?: { data?: { message?: string } } };
	return err?.response?.data?.message ?? "Something went wrong. Try again.";
}
