"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
	FiCheckCircle,
	FiClock,
	FiPackage,
	FiPlayCircle,
	FiTruck,
} from "react-icons/fi";
import styled from "styled-components";
import useSWR from "swr";
import {
	Badge,
	Button,
	Card,
	EmptyState,
	FadeIn,
	Row,
	Skeleton,
	Stack,
	StatCard,
	Text,
	Textarea,
	Title,
} from "@/components";
import { api } from "@/constants/api";
import { fetcher } from "@/constants/fetcher";
import {
	formatDateTime,
	formatKobo,
	statusLabel,
} from "@/constants/formatters";
import {
	canonicalOrderStatus,
	handoverUnavailableMessage,
	isBuyerHandoverEligible,
	orderTimelineSteps,
} from "@/constants/orderLifecycle";
import { useToast } from "@/hooks/useToast";
import { ReceiptCard, RefundNote } from "@/libs/ReceiptCard";
import { OrderAgainButton } from "@/libs/ReorderSheet";
import type { BuyerOrder, OrderStatus } from "@/types";

type BuyerOrderDetail = BuyerOrder & {
	refundAmountKobo?: number | null;
	refundReference?: string | null;
	refundStatus?: "INITIATED" | "SENT_TO_PROVIDER" | null;
	vendorNoResponseExpiredAt?: string | null;
};

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
	READY_FOR_PICKUP: "success",
	READY_FOR_DELIVERY: "success",
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
const StepTitle = styled.span`
	display: inline-flex;
	align-items: center;
	gap: 8px;
`;
const StepIcon = styled.span`
	display: inline-flex;
	color: var(--pc-color-primary);
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
const InstructionGrid = styled.div`
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;

	@media (max-width: 620px) {
		grid-template-columns: 1fr;
	}
`;
const InstructionPanel = styled.div`
	min-width: 0;
	padding: 12px;
	border: 1px solid var(--pc-border);
	border-radius: var(--pc-radius-sm);
	background: var(--pc-surface-2);
`;
const StatusNote = styled.div`
	padding: 12px;
	border: 1px solid var(--pc-border);
	border-radius: var(--pc-radius-sm);
	background: var(--pc-surface);
`;
const HandoverRow = styled(Row)`
	@media (max-width: 520px) {
		align-items: flex-start;
		flex-direction: column;
	}
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

function timelineIcon(icon: string) {
	switch (icon) {
		case "check":
		case "done":
			return <FiCheckCircle size={18} aria-hidden />;
		case "cook":
			return <FiPlayCircle size={18} aria-hidden />;
		case "package":
			return <FiPackage size={18} aria-hidden />;
		case "truck":
			return <FiTruck size={18} aria-hidden />;
		default:
			return <FiClock size={18} aria-hidden />;
	}
}

export default function OrderStatusWrapper({ orderId }: { orderId: string }) {
	const { toast } = useToast();
	const { data, isLoading, error, mutate } = useSWR<BuyerOrderDetail>(
		`/orders/${orderId}`,
		fetcher,
		{ refreshInterval: 20_000 },
	);
	const { data: existingReview, mutate: mutateReview } = useSWR<{
		id: string;
		rating: number;
	} | null>(`/orders/${orderId}/review`, fetcher);
	const canViewHandover = data
		? isBuyerHandoverEligible(
				data.status,
				data.fulfillmentType,
				data.handoverCredentialUsedAt,
			)
		: false;
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

	if (isLoading) {
		return (
			<Wrap $gap={16} aria-busy="true" aria-live="polite">
				<Card>
					<Stack $gap={12}>
						<Skeleton $w="160px" $h={24} />
						<Skeleton $w="100%" $h={16} />
						<Skeleton $w="72%" $h={16} />
					</Stack>
				</Card>
				<Card>
					<Stack $gap={10}>
						<Skeleton $w="120px" $h={18} />
						<Skeleton $w="100%" $h={44} />
						<Skeleton $w="100%" $h={44} />
					</Stack>
				</Card>
			</Wrap>
		);
	}
	if (error || !data) {
		return (
			<Wrap>
				<EmptyState
					icon="!"
					title={error ? "Could not load order" : "Order not found"}
					description={
						error
							? errMsg(error)
							: "This order may have been removed or you may not have access to it."
					}
					action={
						<Button as={Link} href="/my-orders" $pill>
							Back to orders
						</Button>
					}
				/>
			</Wrap>
		);
	}

	const isTerminalBad =
		data.status === "CANCELLED" || data.status === "REFUNDED";
	const isVendorNoResponseRefund =
		data.status === "REFUNDED" && !!data.vendorNoResponseExpiredAt;
	const timeline = orderTimelineSteps(data.fulfillmentType);
	const currentStatus = canonicalOrderStatus(
		data.status,
		data.fulfillmentType,
	);
	const currentIdx = timeline.findIndex(
		(step) => step.status === currentStatus,
	);
	const itemCount = data.items.reduce((s, it) => s + it.quantity, 0);
	const statusCopy = currentStatusCopy(data.status, data.fulfillmentType);
	const refundCopy = getRefundCopy(data);

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
							<Text $size={14}>{statusCopy}</Text>
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
				<FulfillmentCard>
					<Stack $gap={12}>
						<Text $weight={800}>
							{data.fulfillmentType === "DELIVERY"
								? "Delivery instructions"
								: "Pickup instructions"}
						</Text>
						<InstructionGrid>
							<InstructionPanel>
								<Stack $gap={4}>
									<Text $weight={700} $size={14}>
										Where this happens
									</Text>
									<Text $muted $size={13}>
										{data.fulfillmentType === "DELIVERY"
											? "The vendor arranges delivery using the details you entered at checkout."
											: (data.vendorPickupLocation ??
												"Kitchen has not added a pickup spot yet.")}
									</Text>
								</Stack>
							</InstructionPanel>
							<InstructionPanel>
								<Stack $gap={4}>
									<Text $weight={700} $size={14}>
										Handover
									</Text>
									<Text $muted $size={13}>
										{data.fulfillmentType === "DELIVERY"
											? "Show the QR or PIN only when the rider reaches you."
											: "Show the QR or PIN only when you collect the order."}{" "}
										It helps confirm handover, but support
										may still review problems.
									</Text>
								</Stack>
							</InstructionPanel>
						</InstructionGrid>
					</Stack>
				</FulfillmentCard>
			</FadeIn>

			{!isTerminalBad && data.status !== "PENDING_PAYMENT" && (
				<FadeIn $delay={120}>
					<Card>
						<Stack $gap={14}>
							<Text $weight={800}>Order progress</Text>
							<Track>
								{timeline.map((step, i) => {
									const done = currentIdx > i;
									const current = currentIdx === i;
									return (
										<Step
											key={step.status}
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
												{i < timeline.length - 1 && (
													<Conn $done={done} />
												)}
											</DotCol>
											<StepBody>
												<Text
													$weight={
														current ? 800 : 600
													}
												>
													<StepTitle>
														<StepIcon>
															{timelineIcon(
																step.icon,
															)}
														</StepIcon>
														{step.label}
													</StepTitle>
												</Text>
												<Text $muted $size={13}>
													{step.hint}
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
						<HandoverRow $gap={14} $align="center">
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
						</HandoverRow>
					</Stack>
				</Card>
			)}

			{!canViewHandover && data.handoverCredentialUsedAt == null && (
				<StatusNote>
					<Text $muted $size={13}>
						{handoverUnavailableMessage(data.fulfillmentType)}
					</Text>
				</StatusNote>
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
					<Text $weight={800}>Refund status</Text>
					<Text $muted $size={14}>
						{refundCopy}
					</Text>
					{data.refundAmountKobo != null && (
						<Text $size={13}>
							Amount: {formatKobo(data.refundAmountKobo)}
						</Text>
					)}
				</Stack>
			</Card>

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
			{isVendorNoResponseRefund && (
				<Card $accent>
					<Stack $gap={10}>
						<Text $weight={800} $size={15}>
							Order cancelled and refunded.
						</Text>
						<Text $muted $size={14}>
							The kitchen did not accept your order within the
							required time, so the order was cancelled
							automatically. Your refund has been sent back to the
							account you paid from. Your bank may take a few
							working days to reflect it.
						</Text>
						<Stack $gap={6}>
							<Line>
								<Text $muted>Status</Text>
								<Text $weight={700}>Refunded</Text>
							</Line>
							<Line>
								<Text $muted>Cancellation reason</Text>
								<Text $weight={700}>
									Vendor did not accept in time
								</Text>
							</Line>
							{data.refundAmountKobo != null && (
								<Line>
									<Text $muted>Refund amount</Text>
									<Text $weight={700}>
										{formatKobo(data.refundAmountKobo)}
									</Text>
								</Line>
							)}
							{data.refundReference && (
								<Line>
									<Text $muted>Refund reference</Text>
									<Text $weight={700}>
										{data.refundReference}
									</Text>
								</Line>
							)}
							{data.refundStatus && (
								<Line>
									<Text $muted>Refund status</Text>
									<Text $weight={700}>
										{data.refundStatus ===
										"SENT_TO_PROVIDER"
											? "Sent to payment provider"
											: "Initiated"}
									</Text>
								</Line>
							)}
						</Stack>
					</Stack>
				</Card>
			)}
			{isTerminalBad && !isVendorNoResponseRefund && (
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

			<Button
				as={Link}
				href={`/help?audience=buyer&category=ORDER&order=${encodeURIComponent(data.orderNumber)}#support-form`}
				$full
				$variant="secondary"
				aria-label={`Report a problem with order ${data.orderNumber}`}
			>
				Report a problem
			</Button>

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

function currentStatusCopy(
	status: OrderStatus,
	fulfillmentType: "PICKUP" | "DELIVERY",
): string {
	if (status === "READY" && fulfillmentType === "PICKUP")
		return "Your order is ready. Go to the pickup point and show your QR or PIN at handover.";
	if (status === "IN_TRANSIT")
		return "Your order is on the way. Show your QR or PIN only when it arrives.";
	if (status === "REFUND_PENDING" || status === "REFUND_PROCESSING")
		return "A refund is being handled through the payment provider.";
	if (status === "REFUNDED") return "This order has been marked refunded.";
	if (status === "CANCELLED") return "This order was cancelled.";
	return STEP_META[status]?.hint ?? statusLabel(status);
}

function getRefundCopy(order: BuyerOrderDetail): string {
	if (order.refundStatus === "SENT_TO_PROVIDER")
		return "Refund has been sent to the payment provider. Bank timing can vary.";
	if (order.refundStatus === "INITIATED")
		return "Refund has been started and is being processed.";
	if (
		order.status === "REFUND_PENDING" ||
		order.status === "REFUND_PROCESSING" ||
		order.status === "REFUND_FAILED" ||
		order.status === "REFUNDED"
	)
		return statusLabel(order.status);
	return "No refund is active for this order.";
}

function errMsg(e: unknown): string {
	const err = e as { response?: { data?: { message?: string } } };
	return err?.response?.data?.message ?? "Something went wrong. Try again.";
}
