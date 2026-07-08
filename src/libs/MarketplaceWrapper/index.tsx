"use client";

import Link from "next/link";
import styled from "styled-components";
import useSWR from "swr";
import { Badge, Card, Grid, Row, Stack, Text, Title } from "@/components";
import { PageLoader } from "@/components/Loader";
import { fetcher } from "@/constants/fetcher";
import { formatKobo, timeUntil } from "@/constants/formatters";
import { useAuth } from "@/hooks/Auth/useAuth";
import type { Campus, DailyOrder } from "@/types";

const Header = styled(Stack)`
	margin-bottom: var(--pc-space-5);
`;
const CampusTag = styled.span`
	display: inline-flex;
	align-items: center;
	gap: 6px;
	align-self: flex-start;
	background: var(--pc-surface-2);
	color: var(--pc-text-muted);
	font-size: 13px;
	font-weight: 600;
	padding: 5px 12px;
	border-radius: 999px;
`;
const ListingCard = styled(Card)`
	padding: 0;
	overflow: hidden;
	display: flex;
	flex-direction: column;
	transition: box-shadow 0.15s ease, transform 0.15s ease;
	&:hover {
		box-shadow: var(--pc-shadow-lg);
		transform: translateY(-2px);
	}
`;
const CardLink = styled(Link)`
	display: flex;
	flex-direction: column;
	height: 100%;
	color: inherit;
`;
const Thumbs = styled.div`
	display: flex;
	gap: 2px;
	height: 120px;
	background: var(--pc-surface-2);
`;
const Thumb = styled.div<{ $src?: string }>`
	flex: 1;
	background: ${(p) =>
		p.$src
			? `center / cover no-repeat url(${p.$src})`
			: "var(--pc-surface-2)"};
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 30px;
`;
const Body = styled(Stack)`
	padding: var(--pc-space-4);
	flex: 1;
`;
const Cutoff = styled(Badge)``;
const Empty = styled(Card)`
	text-align: center;
	padding: var(--pc-space-8) var(--pc-space-5);
`;

function priceRange(o: DailyOrder): string {
	const prices = o.items.map((i) => i.snapshotPriceKobo);
	if (prices.length === 0) return "—";
	const min = Math.min(...prices);
	const max = Math.max(...prices);
	return min === max
		? formatKobo(min)
		: `${formatKobo(min)} – ${formatKobo(max)}`;
}

export default function MarketplaceWrapper() {
	const { user } = useAuth();
	const campusId = user?.campusId;

	const { data: campuses } = useSWR<Campus[]>("/campuses", fetcher);
	const { data, isLoading } = useSWR<DailyOrder[]>(
		campusId
			? `/daily-orders/marketplace?campusId=${campusId}&limit=20`
			: null,
		fetcher,
	);

	const campusName = campuses?.find((c) => c.id === campusId)?.name;

	if (isLoading || !campusId) return <PageLoader />;

	const listings = data ?? [];

	return (
		<Stack $gap={0}>
			<Header $gap={8}>
				<Title $size={24}>Today&apos;s kitchens</Title>
				<CampusTag>📍 {campusName ?? "Your campus"}</CampusTag>
			</Header>

			{listings.length === 0 ? (
				<Empty>
					<Stack $gap={6}>
						<Text $weight={700} $size={16}>
							No kitchens open right now
						</Text>
						<Text $muted>
							Check back soon — vendors post fresh listings every
							day.
						</Text>
					</Stack>
				</Empty>
			) : (
				<Grid $min={260} $gap={16}>
					{listings.map((o) => {
						const closed = timeUntil(o.cutoffTime) === "closed";
						return (
							<ListingCard key={o.id}>
								<CardLink href={`/o/${o.shareableToken}`}>
									<Thumbs>
										{o.items.slice(0, 3).map((i) => (
											<Thumb
												key={i.id}
												$src={i.snapshotImageUrl}
											>
												{i.snapshotImageUrl ? "" : "🍲"}
											</Thumb>
										))}
										{o.items.length === 0 && (
											<Thumb>🍲</Thumb>
										)}
									</Thumbs>
									<Body $gap={10}>
										<Row
											$justify="space-between"
											$align="flex-start"
											$gap={8}
										>
											<Title $size={17}>{o.title}</Title>
											<Cutoff
												$tone={
													closed
														? "danger"
														: "warning"
												}
											>
												{closed
													? "Closed"
													: timeUntil(o.cutoffTime)}
											</Cutoff>
										</Row>
										<Text $muted $size={13}>
											{o.items.length} item
											{o.items.length === 1 ? "" : "s"} ·{" "}
											{priceRange(o)}
										</Text>
										<Row
											$justify="space-between"
											$align="center"
										>
											<Text $size={13} $muted>
												{o.pickupAvailable && "Pickup"}
												{o.pickupAvailable &&
													o.deliveryAvailable &&
													" · "}
												{o.deliveryAvailable &&
													"Delivery"}
											</Text>
											<Text
												$weight={700}
												$size={14}
												style={{
													color: "var(--pc-color-primary)",
												}}
											>
												Order →
											</Text>
										</Row>
									</Body>
								</CardLink>
							</ListingCard>
						);
					})}
				</Grid>
			)}
		</Stack>
	);
}
