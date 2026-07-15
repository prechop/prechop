"use client";

import styled from "styled-components";
import useSWR from "swr";
import {
	Badge,
	Card,
	EmptyState,
	FadeIn,
	Grid,
	PageHeader,
	Row,
	SectionHeader,
	Stack,
	StatCard,
	Text,
} from "@/components";
import { PageLoader } from "@/components/Loader";
import { fetcher } from "@/constants/fetcher";
import { formatDate, formatDateTime, formatKobo } from "@/constants/formatters";

interface Snapshot {
	id?: string;
	_id?: string;
	date: string;
	totalOrders: number;
	completedOrders: number;
	cancelledOrders: number;
	totalRevenueKobo: number;
	totalFoodSubtotalKobo?: number;
	totalCommissionKobo?: number;
	totalDeliveryEarningsKobo?: number;
	totalVendorSettlementKobo?: number;
	avgOrderValueKobo: number;
	avgRatingForDay?: number;
}
interface Analytics {
	snapshots: Snapshot[];
	lifetime: {
		totalOrders: number;
		completedOrders: number;
		cancelledOrders: number;
		totalRevenueKobo: number;
		totalFoodSubtotalKobo?: number;
		totalCommissionKobo?: number;
		totalDeliveryEarningsKobo?: number;
		totalVendorSettlementKobo?: number;
		avgOrderValueKobo: number;
		rating: number;
		totalReviews: number;
		completionRate: number;
	};
	reviews: Array<{
		id: string;
		buyerName?: string;
		rating: number;
		comment?: string;
		createdAt: string;
	}>;
}

const DayCard = styled(Card)`
	padding: var(--pc-space-4);
	border-left: 3px solid var(--pc-color-accent);
	&:hover {
		box-shadow: var(--pc-shadow);
	}
`;
const Amount = styled.div`
	font-family: var(--pc-font-display);
	font-size: 18px;
	font-weight: 800;
	letter-spacing: -0.02em;
	color: var(--pc-text);
`;

export default function EarningsWrapper() {
	const { data, isLoading } = useSWR<Analytics>("/vendor/analytics", fetcher);

	if (isLoading || !data) return <PageLoader />;

	const snapshots = [...(data.snapshots ?? [])].sort(
		(a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
	);

	const totalRevenue = snapshots.reduce(
		(s, x) =>
			s +
			(x.totalVendorSettlementKobo ??
				x.totalRevenueKobo ??
				0),
		0,
	);
	const totalFoodSubtotal =
		data.lifetime.totalFoodSubtotalKobo ??
		snapshots.reduce((s, x) => s + (x.totalFoodSubtotalKobo ?? 0), 0);
	const totalCommission =
		data.lifetime.totalCommissionKobo ??
		snapshots.reduce((s, x) => s + (x.totalCommissionKobo ?? 0), 0);
	const totalDelivery =
		data.lifetime.totalDeliveryEarningsKobo ??
		snapshots.reduce((s, x) => s + (x.totalDeliveryEarningsKobo ?? 0), 0);
	const completedOrders =
		data.lifetime.completedOrders ??
		snapshots.reduce((s, x) => s + (x.completedOrders ?? 0), 0);
	const avgOrder =
		data.lifetime.avgOrderValueKobo ??
		(completedOrders > 0 ? Math.round(totalRevenue / completedOrders) : 0);
	const completionRate =
		Math.round((data.lifetime.completionRate ?? 0) * 100) / 100;
	const reviews = data.reviews ?? [];

	return (
		<FadeIn>
			<Stack $gap={20}>
				<PageHeader
					eyebrow="Vendor · Money"
					title="Earnings"
					subtitle="Track what your kitchen is bringing in, day by day."
				/>

				<Grid $min={160} $gap={12}>
					<StatCard
						label="Total revenue"
						value={formatKobo(totalRevenue)}
						icon="💰"
						tone="var(--pc-color-accent)"
						hint="Final vendor settlement"
					/>
					<StatCard
						label="Orders"
						value={completedOrders}
						icon="🧾"
						tone="var(--pc-color-primary)"
						hint="Completed paid orders"
					/>
					<StatCard
						label="Avg order value"
						value={formatKobo(avgOrder)}
						icon="📈"
						tone="var(--pc-color-gold)"
						hint="Per completed order"
					/>
					<StatCard
						label="Rating"
						value={`${data.lifetime.rating.toFixed(1)} ★`}
						icon="⭐"
						tone="var(--pc-color-gold)"
						hint={`${data.lifetime.totalReviews} review${
							data.lifetime.totalReviews === 1 ? "" : "s"
						}`}
					/>
				</Grid>

				<Row $gap={12} $wrap>
					<div style={{ flex: 1, minWidth: 160 }}>
						<StatCard
							label="Completion rate"
							value={`${completionRate}%`}
							icon="✅"
							tone="var(--pc-color-accent)"
							hint="Completed / resolved orders"
						/>
					</div>
					<div style={{ flex: 1, minWidth: 160 }}>
						<StatCard
							label="Food subtotal"
							value={formatKobo(totalFoodSubtotal)}
							icon="🍽"
							tone="var(--pc-color-primary)"
							hint="Before commission"
						/>
					</div>
					<div style={{ flex: 1, minWidth: 160 }}>
						<StatCard
							label="Prechop commission"
							value={formatKobo(totalCommission)}
							icon="%"
							tone="var(--pc-color-danger)"
							hint="8% of food subtotal"
						/>
					</div>
					<div style={{ flex: 1, minWidth: 160 }}>
						<StatCard
							label="Delivery earnings"
							value={formatKobo(totalDelivery)}
							icon="🛵"
							tone="var(--pc-color-accent)"
							hint="Passed to vendor"
						/>
					</div>
				</Row>

				<SectionHeader title="Daily breakdown" icon="📅" />
				{snapshots.length === 0 ? (
					<EmptyState
						icon="📊"
						title="No sales data yet"
						description="Your daily performance will show here once orders come in."
					/>
				) : (
					<Stack $gap={10}>
						{snapshots.map((s) => (
							<DayCard key={s.id ?? s._id ?? s.date}>
								<Row
									$justify="space-between"
									$align="center"
									$gap={12}
								>
									<Stack $gap={6}>
										<Text $weight={700}>
											{formatDate(s.date)}
										</Text>
										<Row $gap={6} $wrap>
											<Badge $tone="success">
												{s.completedOrders} completed
											</Badge>
											{s.cancelledOrders > 0 && (
												<Badge $tone="danger">
													{s.cancelledOrders}{" "}
													cancelled
												</Badge>
											)}
											{s.avgRatingForDay != null && (
												<Badge $tone="gold">
													{s.avgRatingForDay.toFixed(
														1,
													)}{" "}
													★
												</Badge>
											)}
										</Row>
									</Stack>
									<Stack
										$gap={2}
										style={{ textAlign: "right" }}
									>
										<Amount>
											{formatKobo(
												s.totalVendorSettlementKobo ??
													s.totalRevenueKobo,
											)}
										</Amount>
										<Text $muted $size={12}>
											{s.totalOrders} order
											{s.totalOrders === 1 ? "" : "s"}
										</Text>
										<Text $muted $size={12}>
											Food{" "}
											{formatKobo(
												s.totalFoodSubtotalKobo ?? 0,
											)}{" "}
											· Commission{" "}
											{formatKobo(
												s.totalCommissionKobo ?? 0,
											)}{" "}
											· Delivery{" "}
											{formatKobo(
												s.totalDeliveryEarningsKobo ??
													0,
											)}
										</Text>
									</Stack>
								</Row>
							</DayCard>
						))}
					</Stack>
				)}

				<SectionHeader title="Customer reviews" icon="★" />
				{reviews.length === 0 ? (
					<EmptyState
						icon="★"
						title="No customer reviews yet"
						description="Reviews from completed customer orders will show here."
					/>
				) : (
					<Stack $gap={10}>
						{reviews.map((review) => (
							<DayCard key={review.id}>
								<Row
									$justify="space-between"
									$align="flex-start"
									$gap={12}
								>
									<Stack $gap={6}>
										<Row $gap={8} $align="center" $wrap>
											<Text $weight={800}>
												{review.buyerName || "Customer"}
											</Text>
											<Badge $tone="gold">
												{"★".repeat(review.rating)}
											</Badge>
										</Row>
										<Text $size={14}>
											{review.comment || "No written comment."}
										</Text>
									</Stack>
									<Text $muted $size={12}>
										{formatDateTime(review.createdAt)}
									</Text>
								</Row>
							</DayCard>
						))}
					</Stack>
				)}
			</Stack>
		</FadeIn>
	);
}
