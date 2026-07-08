"use client";

import styled from "styled-components";
import useSWR from "swr";
import { Card, Grid, Row, Stack, Text, Title } from "@/components";
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

const Stat = styled(Card)`
	padding: var(--pc-space-4);
`;
const DayCard = styled(Card)`
	padding: var(--pc-space-4);
`;
const Empty = styled(Card)`
	text-align: center;
	padding: var(--pc-space-8) var(--pc-space-5);
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
		<Stack $gap={16}>
			<Title $size={24}>Earnings</Title>

			<Grid $min={150} $gap={12}>
				<Stat>
					<Stack $gap={4}>
						<Text $muted $size={13}>
							Total revenue
						</Text>
						<Text $weight={800} $size={22}>
							{formatKobo(totalRevenue)}
						</Text>
					</Stack>
				</Stat>
				<Stat>
					<Stack $gap={4}>
						<Text $muted $size={13}>
							Orders
						</Text>
						<Text $weight={800} $size={22}>
							{totalOrders}
						</Text>
					</Stack>
				</Stat>
				<Stat>
					<Stack $gap={4}>
						<Text $muted $size={13}>
							Avg order value
						</Text>
						<Text $weight={800} $size={22}>
							{formatKobo(avgOrder)}
						</Text>
					</Stack>
				</Stat>
				<Stat>
					<Stack $gap={4}>
						<Text $muted $size={13}>
							Rating
						</Text>
						<Text $weight={800} $size={22}>
							{data.lifetime.rating.toFixed(1)} ★
						</Text>
						<Text $muted $size={12}>
							{data.lifetime.totalReviews} review
							{data.lifetime.totalReviews === 1 ? "" : "s"}
						</Text>
					</Stack>
				</Stat>
			</Grid>

			<Row $gap={12} $wrap>
				<Card
					style={{
						flex: 1,
						minWidth: 150,
						padding: "var(--pc-space-4)",
					}}
				>
					<Stack $gap={4}>
						<Text $muted $size={13}>
							Lifetime orders
						</Text>
						<Text $weight={700} $size={18}>
							{data.lifetime.totalOrders}
						</Text>
					</Stack>
				</Card>
				<Card
					style={{
						flex: 1,
						minWidth: 150,
						padding: "var(--pc-space-4)",
					}}
				>
					<Stack $gap={4}>
						<Text $muted $size={13}>
							Completion rate
						</Text>
						<Text $weight={700} $size={18}>
							{Math.round(
								(data.lifetime.completionRate ?? 0) * 100,
							) / 100}
							%
						</Text>
					</Stack>
				</Card>
			</Row>

			<Title $size={17}>Daily breakdown</Title>
			{snapshots.length === 0 ? (
				<Empty>
					<Stack $gap={6}>
						<Text $weight={700} $size={16}>
							No sales data yet
						</Text>
						<Text $muted>
							Your daily performance will show here once orders
							come in.
						</Text>
					</Stack>
				</Empty>
			) : (
				<Stack $gap={10}>
					{snapshots.map((s) => (
						<DayCard key={s.id ?? s._id ?? s.date}>
							<Row
								$justify="space-between"
								$align="center"
								$gap={8}
							>
								<Stack $gap={2}>
									<Text $weight={700}>
										{formatDate(s.date)}
									</Text>
									<Text $muted $size={13}>
										{s.completedOrders} completed ·{" "}
										{s.cancelledOrders} cancelled
									</Text>
								</Stack>
								<Stack $gap={2} style={{ textAlign: "right" }}>
									<Text $weight={700}>
										{formatKobo(s.totalRevenueKobo)}
									</Text>
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
	);
}
