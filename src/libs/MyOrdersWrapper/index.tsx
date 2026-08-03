"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import styled from "styled-components";
import useSWR from "swr";
import {
	Badge,
	Button,
	Card,
	EmptyState,
	FadeIn,
	PageHeader,
	Row,
	Skeleton,
	Stack,
	StatCard,
	Text,
} from "@/components";
import { fetcher } from "@/constants/fetcher";
import {
	formatDateTime,
	formatKobo,
	statusLabel,
} from "@/constants/formatters";
import { canSendOrderChat } from "@/constants/orderChat";
import {
	orderOutcomeSummary,
	refundOutcomeLabel,
} from "@/constants/orderOutcome";
import {
	hasLateOrderAck,
	rememberLateOrderAck,
} from "@/libs/lateOrderAcknowledgement";
import { OrderAgainButton } from "@/libs/ReorderSheet";
import type { BuyerOrder, OrderConversation, OrderStatus } from "@/types";

const tone: Record<
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

const ACTIVE: OrderStatus[] = [
	"PENDING_PAYMENT",
	"PAID",
	"AWAITING_VENDOR_ACCEPTANCE",
	"ACCEPTED",
	"CONFIRMED",
	"COOKING",
	"PREPARING",
	"READY",
	"READY_FOR_PICKUP",
	"READY_FOR_DELIVERY",
	"IN_TRANSIT",
	"AWAITING_BUYER_NO_SHOW_RESPONSE",
	"BUYER_UNREACHABLE_REPORTED",
	"PICKED_UP",
	"DELIVERED",
	"REFUND_PENDING",
	"REFUND_PROCESSING",
	"REFUND_FAILED",
];

const OrderCard = styled(Card)`
  position: relative;
  overflow: hidden;
  color: inherit;
`;
/* Stretched-link overlay: the whole card is navigable, but the anchor is a
   sibling of the reorder <button> (not an ancestor), so no interactive control
   is ever nested inside an <a> (WCAG 4.1.2 / valid HTML). */
const CardOverlayLink = styled(Link)`
  position: absolute;
  inset: 0;
  z-index: 1;
  border-radius: inherit;
`;
/* Lifted above the overlay link so the reorder button stays independently
   clickable and is not covered by the navigable overlay. */
const ReorderRow = styled(Row)`
  position: relative;
  z-index: 2;
`;
const Thumb = styled.div`
  width: 46px;
  height: 46px;
  flex: 0 0 auto;
  border-radius: var(--pc-radius-sm);
  display: grid;
  place-items: center;
  font-size: 24px;
  background: var(--pc-color-primary-50);
`;
const Divider = styled.div`
  height: 1px;
  background: var(--pc-border);
`;
const Chevron = styled.span`
  color: var(--pc-text-faint);
  font-size: 20px;
  line-height: 1;
`;
const CompactStatsGrid = styled.div`
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

  > div > span {
    font-size: 11.5px;
    line-height: 1.15;
  }

  @media (min-width: 390px) {
    > div > div:nth-child(2) {
      font-size: 22px;
    }
  }
`;

const LateNotice = styled.div`
  position: relative;
  z-index: 2;
  display: grid;
  gap: 3px;
  padding: 9px 10px;
  border: 1px solid rgba(229, 72, 77, 0.34);
  border-radius: var(--pc-radius-sm);
  background: var(--pc-color-danger-50);
  color: var(--pc-color-danger-ink);
`;

const OutcomeNotice = styled(LateNotice)`
	border-color: var(--pc-border);
	background: var(--pc-surface-muted);
	color: var(--pc-text);
`;

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1400;
  display: grid;
  place-items: center;
  padding: var(--pc-space-4);
  background: rgba(20, 16, 12, 0.62);

  @media (max-width: 640px) {
    align-items: end;
    padding: 0;
  }
`;

const LateSheet = styled.div`
  width: min(100%, 460px);
  max-height: min(86dvh, 620px);
  overflow: auto;
  border: 1px solid var(--pc-border);
  border-radius: var(--pc-radius-lg);
  background: var(--pc-surface);
  box-shadow: var(--pc-shadow-lg);
  padding: var(--pc-space-5);

  @media (max-width: 640px) {
    width: 100%;
    border-radius: 22px 22px 0 0;
    padding: var(--pc-space-4);
  }
`;

const ModalActions = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;

  @media (max-width: 420px) {
    grid-template-columns: 1fr;
  }
`;

function isLateActiveOrder(order: BuyerOrder) {
	return (
		!!order.lateMarkedAt &&
		ACTIVE.includes(order.status) &&
		canSendOrderChat({ status: order.status }) &&
		!order.handoverCredentialUsedAt
	);
}

export default function MyOrdersWrapper() {
	const router = useRouter();
	const { data, isLoading } = useSWR<BuyerOrder[]>(
		"/orders?limit=50",
		fetcher,
		{ refreshInterval: 20_000 },
	);
	const { data: conversations } = useSWR<OrderConversation[]>(
		"/order-conversations?limit=100",
		fetcher,
		{ refreshInterval: 15_000 },
	);
	const [lateModalOrderId, setLateModalOrderId] = useState<string | null>(
		null,
	);
	const orders = data ?? [];
	const unreadByOrder = new Map(
		(conversations ?? []).map((conversation) => [
			conversation.orderId,
			conversation.unreadCount,
		]),
	);
	const lateModalOrder =
		orders.find((order) => order.id === lateModalOrderId) ?? null;

	useEffect(() => {
		if (lateModalOrderId || orders.length === 0) return;
		const nextLate = orders.find(
			(order) =>
				isLateActiveOrder(order) && !hasLateOrderAck("buyer", order.id),
		);
		if (nextLate) setLateModalOrderId(nextLate.id);
	}, [lateModalOrderId, orders]);

	function dismissLateModal(order: BuyerOrder) {
		rememberLateOrderAck("buyer", order.id);
		setLateModalOrderId(null);
	}

	function messageKitchen(order: BuyerOrder) {
		if (!canSendOrderChat({ status: order.status })) return;
		dismissLateModal(order);
		router.push(`/my-orders/${order.id}#messages`);
	}

	if (isLoading) {
		return (
			<Stack $gap={20}>
				<PageHeader
					eyebrow="Your kitchen runs"
					title="My orders"
					subtitle="Every plate you've pre-ordered, from cutoff to pickup."
				/>
				<Stack $gap={12}>
					{[0, 1, 2, 3].map((i) => (
						<Card key={i}>
							<Stack $gap={12}>
								<Row $justify="space-between">
									<Skeleton $w="140px" $h={18} />
									<Skeleton
										$w="80px"
										$h={22}
										$radius="999px"
									/>
								</Row>
								<Skeleton $w="60%" $h={14} />
							</Stack>
						</Card>
					))}
				</Stack>
			</Stack>
		);
	}

	const activeCount = orders.filter((o) => ACTIVE.includes(o.status)).length;
	const spentKobo = orders
		.filter((o) => o.status !== "CANCELLED" && o.status !== "REFUNDED")
		.reduce((s, o) => s + o.totalKobo, 0);

	return (
		<Stack $gap={20}>
			{lateModalOrder && (
				<ModalOverlay
					role="presentation"
					onClick={() => dismissLateModal(lateModalOrder)}
				>
					<LateSheet
						role="dialog"
						aria-modal="true"
						aria-labelledby="buyer-late-order-title"
						onClick={(event) => event.stopPropagation()}
					>
						<Stack $gap={14}>
							<Stack $gap={6}>
								<Badge $tone="danger">Running late</Badge>
								<Text
									id="buyer-late-order-title"
									$weight={900}
									$size={22}
								>
									Kitchen needs more time
								</Text>
								<Text $muted>
									Order {lateModalOrder.orderNumber} has
									passed the expected ready time. You can keep
									waiting, message the kitchen, or get help
									from support.
								</Text>
							</Stack>
							{lateModalOrder.revisedReadyAt ? (
								<Text $muted $size={13}>
									Updated estimate:{" "}
									{formatDateTime(
										lateModalOrder.revisedReadyAt,
									)}
								</Text>
							) : lateModalOrder.expectedReadyAt ? (
								<Text $muted $size={13}>
									Expected ready:{" "}
									{formatDateTime(
										lateModalOrder.expectedReadyAt,
									)}
								</Text>
							) : null}
							<ModalActions>
								<Button
									onClick={() =>
										dismissLateModal(lateModalOrder)
									}
								>
									Continue waiting
								</Button>
								<Button
									$variant="secondary"
									onClick={() =>
										messageKitchen(lateModalOrder)
									}
								>
									Message kitchen
								</Button>
							</ModalActions>
							<Button
								as={Link}
								href={`/help?audience=buyer&category=ORDER&order=${encodeURIComponent(lateModalOrder.orderNumber)}#support-form`}
								$variant="ghost"
								onClick={() => dismissLateModal(lateModalOrder)}
							>
								Get help
							</Button>
						</Stack>
					</LateSheet>
				</ModalOverlay>
			)}
			<PageHeader
				eyebrow="Your kitchen runs"
				title="My orders"
				subtitle="Every plate you've pre-ordered, from cutoff to pickup."
				actions={
					<Button
						as={Link}
						href="/marketplace"
						$variant="secondary"
						$size="sm"
						$pill
					>
						Browse kitchens
					</Button>
				}
			/>

			{orders.length === 0 ? (
				<FadeIn>
					<EmptyState
						icon="🍲"
						title="No orders yet"
						description="Browse today's kitchens and place your first order — freshly cooked, ready at cutoff."
						action={
							<Button as={Link} href="/marketplace" $pill>
								Go to marketplace →
							</Button>
						}
					/>
				</FadeIn>
			) : (
				<>
					<FadeIn>
						<CompactStatsGrid>
							<StatCard
								label="Orders"
								value={orders.length}
								icon="🧾"
							/>
							<StatCard
								label="Active"
								value={activeCount}
								icon="🔥"
								tone="var(--pc-color-primary)"
								hint={
									activeCount === 1
										? "1 cooking"
										: "cooking now"
								}
							/>
							<StatCard
								label="Spent"
								value={formatKobo(spentKobo)}
								icon="💳"
								tone="var(--pc-color-accent)"
							/>
						</CompactStatsGrid>
					</FadeIn>

					<Stack $gap={12}>
						{orders.map((o, i) => {
							const outcome = orderOutcomeSummary(o);
							const refundLabel = refundOutcomeLabel(o);
							return (
							<FadeIn key={o.id} $delay={i * 45}>
								<OrderCard $hover>
									<CardOverlayLink
										href={`/my-orders/${o.id}`}
										aria-label={`Order ${o.orderNumber}`}
									/>
									<Stack $gap={12}>
										<Row
											$justify="space-between"
											$align="flex-start"
											$gap={12}
										>
											<Row $gap={12} $align="center">
												<Thumb aria-hidden>🍱</Thumb>
												<Stack $gap={2}>
													<Text $weight={800}>
														{o.orderNumber}
													</Text>
													<Text $muted $size={13}>
														{formatDateTime(
															o.createdAt,
														)}
													</Text>
												</Stack>
											</Row>
											<Row $gap={8} $align="center">
												{(unreadByOrder.get(o.id) ??
													0) > 0 && (
													<Badge $tone="primary">
														{unreadByOrder.get(
															o.id,
														)}{" "}
														unread
													</Badge>
												)}
												<Badge $tone={tone[o.status]}>
													{statusLabel(o.status)}
												</Badge>
											</Row>
										</Row>
										<Divider />
										{isLateActiveOrder(o) && (
											<LateNotice>
												<Text $weight={900} $size={12}>
													Running late
												</Text>
												<Text $size={12}>
													The kitchen needs more time.
													Open the order for contact,
													help, cancellation and
													refund options.
												</Text>
											</LateNotice>
										)}
										{outcome && (
											<OutcomeNotice>
												<Text $weight={900} $size={12}>
													{outcome.title}
												</Text>
												{outcome.reason && (
													<Text $size={12}>
														Reason: {outcome.reason}
													</Text>
												)}
												{refundLabel && (
													<Text $size={12}>
														{refundLabel}
													</Text>
												)}
											</OutcomeNotice>
										)}
										<Row
											$justify="space-between"
											$align="center"
											$gap={10}
										>
											<Text $muted $size={13}>
												{o.items.length} item
												{o.items.length === 1
													? ""
													: "s"}{" "}
												·{" "}
												{o.fulfillmentType ===
												"DELIVERY"
													? "Delivery"
													: "Pickup"}
											</Text>
											<Row $gap={8} $align="center">
												<Text $weight={800}>
													{formatKobo(o.totalKobo)}
												</Text>
												<Chevron aria-hidden>›</Chevron>
											</Row>
										</Row>
										{/* Reordering only makes sense once
											    an order actually happened. */}
										{o.status === "COMPLETED" && (
											<ReorderRow $justify="flex-end">
												<OrderAgainButton
													orderId={o.id}
													$variant="secondary"
													$size="sm"
													$pill
												/>
											</ReorderRow>
										)}
									</Stack>
								</OrderCard>
							</FadeIn>
							);
						})}
					</Stack>
				</>
			)}
		</Stack>
	);
}
