"use client";

import useSWR from "swr";
import {
	Card,
	Grid,
	PageHeader,
	Skeleton,
	Stack,
	StatCard,
	Text,
} from "@/components";
import { fetcher } from "@/constants/fetcher";

interface Analytics {
	totalVendors: number;
	activeVendors: number;
	totalPaidOrders: number;
	topVendors: {
		id: string;
		businessName: string | null;
		rating: number;
		totalOrders: number;
		totalReviews: number;
	}[];
}

export default function AdminAnalyticsWrapper() {
	const { data, isLoading } = useSWR<Analytics>("/admin/analytics", fetcher);

	return (
		<Stack $gap={20}>
			<PageHeader
				eyebrow="Insights"
				title="Platform analytics"
				subtitle="Key metrics across all vendors and orders."
			/>
			{isLoading || !data ? (
				<Skeleton style={{ height: 120 }} />
			) : (
				<>
					<Grid>
						<StatCard
							label="Total vendors"
							value={data.totalVendors}
							icon="🍳"
						/>
						<StatCard
							label="Active vendors"
							value={data.activeVendors}
							icon="✅"
						/>
						<StatCard
							label="Paid orders"
							value={data.totalPaidOrders}
							icon="🧾"
						/>
					</Grid>
					<Card>
						<Text $weight={700} $size={16}>
							Top vendors
						</Text>
						<Stack $gap={8} style={{ marginTop: 12 }}>
							{data.topVendors.length === 0 ? (
								<Text $muted>No active vendors yet.</Text>
							) : (
								data.topVendors.map((v, i) => (
									<div
										key={v.id}
										style={{
											display: "flex",
											justifyContent: "space-between",
											padding: "8px 0",
											borderBottom:
												"1px solid var(--pc-border)",
										}}
									>
										<Text $weight={600}>
											{i + 1}. {v.businessName ?? "—"}
										</Text>
										<Text $muted $size={13}>
											⭐ {v.rating.toFixed(1)} ·{" "}
											{v.totalOrders} orders ·{" "}
											{v.totalReviews} reviews
										</Text>
									</div>
								))
							)}
						</Stack>
					</Card>
				</>
			)}
		</Stack>
	);
}
