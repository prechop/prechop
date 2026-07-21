"use client";

import Link from "next/link";
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
import { OrderAgainButton } from "@/libs/ReorderSheet";
import type { BuyerOrder, OrderStatus } from "@/types";

const tone: Record<
	OrderStatus,
	"primary" | "success" | "warning" | "danger" | "muted"
> = {
	PENDING_PAYMENT: "warning",
	AWAITING_EXTERNAL_PAYMENT: "warning",
	PAID: "primary",
	CONFIRMED: "primary",
	PREPARING: "warning",
	READY: "success",
	IN_TRANSIT: "success",
	COMPLETED: "success",
	CANCELLED: "danger",
	REFUNDED: "muted",
};

const ACTIVE: OrderStatus[] = [
	"PENDING_PAYMENT",
	"PAID",
	"CONFIRMED",
	"PREPARING",
	"READY",
	"IN_TRANSIT",
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

export default function MyOrdersWrapper() {
	const { data, isLoading } = useSWR<BuyerOrder[]>(
		"/orders?limit=50",
		fetcher,
	);

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

	const orders = data ?? [];
	const activeCount = orders.filter((o) => ACTIVE.includes(o.status)).length;
	const spentKobo = orders
		.filter((o) => o.status !== "CANCELLED" && o.status !== "REFUNDED")
		.reduce((s, o) => s + o.totalKobo, 0);

	return (
		<Stack $gap={20}>
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
						{orders.map((o, i) => (
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
											<Badge $tone={tone[o.status]}>
												{statusLabel(o.status)}
											</Badge>
										</Row>
										<Divider />
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
						))}
					</Stack>
				</>
			)}
		</Stack>
	);
}
