"use client";

import Link from "next/link";
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
	Skeleton,
	Stack,
	Text,
	Title,
} from "@/components";
import { fetcher } from "@/constants/fetcher";
import { formatDate, formatKobo, timeUntil } from "@/constants/formatters";
import { useAuth } from "@/hooks/Auth/useAuth";
import type { Campus, DailyOrder } from "@/types";

const CampusTag = styled.span`
	display: inline-flex;
	align-items: center;
	gap: 6px;
	background: var(--pc-surface);
	border: 1px solid var(--pc-border);
	color: var(--pc-text-muted);
	font-size: 13px;
	font-weight: 700;
	padding: 7px 14px;
	border-radius: var(--pc-radius-pill);
	box-shadow: var(--pc-shadow-sm);
`;
const ListingCard = styled(Card)`
	padding: 0;
	overflow: hidden;
	display: flex;
	flex-direction: column;
	transition: box-shadow var(--pc-dur) var(--pc-ease), transform var(--pc-dur) var(--pc-ease);
	&:hover {
		box-shadow: var(--pc-shadow-lg);
		transform: translateY(-3px);
	}
`;
const CardLink = styled(Link)`
	display: flex;
	flex-direction: column;
	height: 100%;
	color: inherit;
`;
const Media = styled.div`
	position: relative;
	height: 150px;
`;
const Thumbs = styled.div`
	display: flex;
	gap: 2px;
	height: 100%;
	background: var(--pc-surface-2);
`;
const Thumb = styled.div<{ $src?: string }>`
	flex: 1;
	background: ${(p) =>
		p.$src
			? `center / cover no-repeat url(${p.$src})`
			: "var(--pc-color-primary-50)"};
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 34px;
`;
const MediaShade = styled.div`
	position: absolute;
	inset: 0;
	pointer-events: none;
	background: linear-gradient(to top, rgba(0, 0, 0, 0.28), transparent 55%);
`;
const CutoffFloat = styled.div`
	position: absolute;
	top: 10px;
	right: 10px;
	z-index: 1;
`;
const Body = styled(Stack)`
	padding: var(--pc-space-4);
	flex: 1;
`;
const Foot = styled(Row)`
	padding-top: var(--pc-space-2);
	border-top: 1px solid var(--pc-border);
`;
const OrderCta = styled.span`
	font-weight: 700;
	font-size: 14px;
	color: var(--pc-color-primary);
`;
const Chips = styled(Row)`
	flex-wrap: wrap;
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

	if (isLoading || !campusId) {
		return (
			<Stack $gap={0}>
				<PageHeader
					eyebrow="Marketplace"
					title="Today's kitchens"
					subtitle="Fresh listings from campus vendors, updated daily."
				/>
				<Grid $min={260} $gap={16}>
					{[0, 1, 2, 3, 4, 5].map((n) => (
						<Card key={n} $pad={0}>
							<Skeleton $h={150} $radius="0" />
							<Stack $gap={10} style={{ padding: 16 }}>
								<Skeleton $w="70%" $h={18} />
								<Skeleton $w="45%" $h={13} />
								<Skeleton $w="55%" $h={13} />
							</Stack>
						</Card>
					))}
				</Grid>
			</Stack>
		);
	}

	const listings = data ?? [];

	return (
		<Stack $gap={0}>
			<PageHeader
				eyebrow="Marketplace"
				title="Today's kitchens"
				subtitle="Order before they cook — reserve your plate from campus vendors serving today."
				actions={
					<CampusTag>📍 {campusName ?? "Your campus"}</CampusTag>
				}
			/>

			{listings.length === 0 ? (
				<EmptyState
					icon="🍲"
					title="No kitchens open right now"
					description="Check back soon — vendors post fresh listings every day."
				/>
			) : (
				<Grid $min={260} $gap={16}>
					{listings.map((o, i) => {
						const closed = timeUntil(o.cutoffTime) === "closed";
						const comingSoon = o.availableFrom
							? new Date(o.availableFrom).getTime() > Date.now()
							: false;
						return (
							<FadeIn key={o.id} $delay={i * 45}>
								<ListingCard>
									<CardLink href={`/o/${o.shareableToken}`}>
										<Media>
											<CutoffFloat>
												<Badge
													$tone={
														comingSoon
															? "primary"
															: closed
																? "danger"
																: "warning"
													}
												>
													{comingSoon
														? `🔜 Starts ${formatDate(o.availableFrom as string)}`
														: closed
															? "⛔ Closed"
															: `⏱ ${timeUntil(o.cutoffTime)}`}
												</Badge>
											</CutoffFloat>
											<Thumbs>
												{o.items
													.slice(0, 3)
													.map((it) => (
														<Thumb
															key={it.id}
															$src={
																it.snapshotImageUrl
															}
														>
															{it.snapshotImageUrl
																? ""
																: "🍲"}
														</Thumb>
													))}
												{o.items.length === 0 && (
													<Thumb>🍲</Thumb>
												)}
											</Thumbs>
											<MediaShade />
										</Media>
										<Body $gap={10}>
											<Title $size={17}>{o.title}</Title>
											<Chips $gap={6}>
												<Badge $tone="muted">
													{o.items.length} item
													{o.items.length === 1
														? ""
														: "s"}
												</Badge>
												<Badge $tone="gold">
													{priceRange(o)}
												</Badge>
											</Chips>
											<Foot
												$justify="space-between"
												$align="center"
											>
												<Text $size={13} $muted>
													{o.pickupAvailable &&
														"Pickup"}
													{o.pickupAvailable &&
														o.deliveryAvailable &&
														" · "}
													{o.deliveryAvailable &&
														"Delivery"}
												</Text>
												<OrderCta>
													{comingSoon
														? "Coming soon"
														: "Order →"}
												</OrderCta>
											</Foot>
										</Body>
									</CardLink>
								</ListingCard>
							</FadeIn>
						);
					})}
				</Grid>
			)}
		</Stack>
	);
}
