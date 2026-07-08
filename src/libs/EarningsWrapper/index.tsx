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
import { formatDate, formatKobo } from "@/constants/formatters";

interface Snapshot {
	id?: string;
	_id?: string;
	date: string;
	totalOrders: number;
	completedOrders: number;
	cancelledOrders: number;
	totalRevenueKobo: number;
	avgOrderValueKobo: number;
	avgRatingForDay?: number;
}
interface Analytics {
	snapshots: Snapshot[];
	lifetime: {
		totalOrders: number;
		rating: number;
		totalReviews: number;
		completionRate: number;
	};
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
		(s, x) => s + (x.totalRevenueKobo ?? 0),
		0,
	);
	const totalOrders = snapshots.reduce((s, x) => s + (x.totalOrders ?? 0), 0);
	const completed = snapshots.reduce(
		(s, x) => s + (x.completedOrders ?? 0),
		0,
	);
	const avgOrder = completed > 0 ? Math.round(totalRevenue / completed) : 0;

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
						hint="Across all sales"
					/>
					<StatCard
						label="Orders"
						value={totalOrders}
						icon="🧾"
						tone="var(--pc-color-primary)"
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
							label="Lifetime orders"
							value={data.lifetime.totalOrders}
							icon="📦"
							tone="var(--pc-color-primary)"
						/>
					</div>
					<div style={{ flex: 1, minWidth: 160 }}>
						<StatCard
							label="Completion rate"
							value={`${
								Math.round(
									(data.lifetime.completionRate ?? 0) * 100,
								) / 100
							}%`}
							icon="✅"
							tone="var(--pc-color-accent)"
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
											{formatKobo(s.totalRevenueKobo)}
										</Amount>
										<Text $muted $size={12}>
											{s.totalOrders} order
											{s.totalOrders === 1 ? "" : "s"}
										</Text>
									</Stack>
								</Row>
							</DayCard>
						))}
					</Stack>
				)}
			</Stack>
		</FadeIn>
	);
}
