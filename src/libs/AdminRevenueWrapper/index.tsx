"use client";

import useSWR from "swr";
import { Grid, PageHeader, Skeleton, Stack, StatCard } from "@/components";
import { fetcher } from "@/constants/fetcher";
import { formatKobo } from "@/constants/formatters";

interface RevenueResult {
	grossRevenueKobo: number;
	platformFeeKobo: number;
	serviceFeeKobo?: number;
	vendorPayoutKobo: number;
	refundedRevenueKobo: number;
	successfulPayments: number;
	refundedPayments: number;
}

export default function AdminRevenueWrapper() {
	const { data, isLoading } = useSWR<RevenueResult>("/admin/revenue", fetcher);

	return (
		<Stack $gap={20}>
			<PageHeader
				eyebrow="Finance"
				title="Revenue"
				subtitle="Track successful payment volume, 8% commission, service fees, vendor settlements and refunds."
			/>
			{isLoading || !data ? (
				<Skeleton style={{ height: 120 }} />
			) : (
				<Grid>
					<StatCard
						label="Gross revenue"
						value={formatKobo(data.grossRevenueKobo)}
						icon="💹"
						tone="var(--pc-color-accent)"
						hint={`${data.successfulPayments} successful payment${
							data.successfulPayments === 1 ? "" : "s"
						}`}
					/>
					<StatCard
						label="Prechop commission"
						value={formatKobo(data.platformFeeKobo)}
						icon="🏦"
						tone="var(--pc-color-primary)"
					/>
					<StatCard
						label="Buyer service fees"
						value={formatKobo(data.serviceFeeKobo ?? 0)}
						icon="%"
						tone="var(--pc-color-accent)"
					/>
					<StatCard
						label="Vendor payouts"
						value={formatKobo(data.vendorPayoutKobo)}
						icon="💰"
						tone="var(--pc-color-gold)"
					/>
					<StatCard
						label="Refunded"
						value={formatKobo(data.refundedRevenueKobo)}
						icon="↩"
						tone="var(--pc-color-danger)"
						hint={`${data.refundedPayments} refund${
							data.refundedPayments === 1 ? "" : "s"
						}`}
					/>
				</Grid>
			)}
		</Stack>
	);
}
