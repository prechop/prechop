"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styled from "styled-components";
import useSWR from "swr";
import {
	Badge,
	Card,
	EmptyState,
	FadeIn,
	Grid,
	Input,
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
import type {
	Campus,
	DailyOrder,
	MarketplaceVendor,
	VendorSearchHit,
} from "@/types";

interface MarketplaceAvailability {
	marketplaceEnabled: boolean;
}

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
const VendorCard = styled(Card)`
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
const Thumb = styled.div<{ $src?: string | null }>`
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
const BadgeFloat = styled.div`
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
const Cta = styled.span`
	font-weight: 700;
	font-size: 14px;
	color: var(--pc-color-primary);
`;
const Chips = styled(Row)`
	flex-wrap: wrap;
`;
const Meta = styled.span`
	font-size: 12.5px;
	font-weight: 700;
	color: var(--pc-text-muted);
	display: inline-flex;
	align-items: center;
	gap: 5px;
`;
const SearchWrap = styled.div`
	margin: var(--pc-space-2) 0 var(--pc-space-4);
`;
const MatchTag = styled.span`
	display: inline-flex;
	padding: 2px 8px;
	border-radius: var(--pc-radius-pill);
	background: var(--pc-color-primary-50);
	color: var(--pc-color-primary);
	font-size: 11px;
	font-weight: 700;
	text-transform: capitalize;
`;

function isMarketplaceUnavailable(error: unknown): boolean {
	const err = error as {
		response?: { status?: number; data?: { appCode?: string } };
	};
	return (
		err?.response?.status === 503 ||
		err?.response?.data?.appCode === "MARKETPLACE_UNAVAILABLE"
	);
}

function vendorPriceRange(listings: DailyOrder[]): string {
	const prices = listings.flatMap((o) =>
		o.items.map((i) => i.snapshotPriceKobo),
	);
	if (prices.length === 0) return "View menu";
	const min = Math.min(...prices);
	const max = Math.max(...prices);
	return min === max
		? formatKobo(min)
		: `${formatKobo(min)} - ${formatKobo(max)}`;
}

function nextOpeningLabel(listings: DailyOrder[]): string {
	const futureStarts = listings
		.map((o) => o.availableFrom && new Date(o.availableFrom))
		.filter((d): d is Date => !!d && d.getTime() > Date.now())
		.sort((a, b) => a.getTime() - b.getTime());
	if (futureStarts[0]) return `Opens ${formatDate(futureStarts[0])}`;
	return "Check back later";
}

function fulfillmentLabel(listing?: DailyOrder): string {
	if (!listing) return "Menu, prices and ratings";
	return [
		listing.pickupAvailable ? "Pickup" : null,
		listing.deliveryAvailable ? "Delivery" : null,
	]
		.filter(Boolean)
		.join(" / ");
}

function statusLabel(row: MarketplaceVendor): string {
	if (!row.vendor.isOpenForOrders) return "Closed for orders";
	const primary = row.listings[0];
	if (!primary) return "Open";
	if (primary.availableFrom && new Date(primary.availableFrom).getTime() > Date.now()) {
		return nextOpeningLabel(row.listings);
	}
	const cutoff = timeUntil(primary.cutoffTime);
	return cutoff === "closed" ? "Closed for orders" : cutoff;
}

export default function MarketplaceWrapper() {
	const { user } = useAuth();
	const { data: campuses } = useSWR<Campus[]>("/campuses", fetcher);
	const campusId = user?.campusId ?? campuses?.[0]?.id;
	const { data: availability, isLoading: availabilityLoading } =
		useSWR<MarketplaceAvailability>("/site-configs/marketplace", fetcher, {
			refreshInterval: 10_000,
		});
	const marketplaceEnabled = availability?.marketplaceEnabled !== false;
	const { data, isLoading, error } = useSWR<MarketplaceVendor[]>(
		campusId && marketplaceEnabled
			? `/daily-orders/marketplace?campusId=${campusId}&limit=50`
			: null,
		fetcher,
	);

	const [search, setSearch] = useState("");
	const [debounced, setDebounced] = useState("");
	useEffect(() => {
		const t = setTimeout(() => setDebounced(search.trim()), 300);
		return () => clearTimeout(t);
	}, [search]);
	const searching = debounced.length > 0;
	const { data: hits, isLoading: hitsLoading } = useSWR<VendorSearchHit[]>(
		campusId && marketplaceEnabled && searching
			? `/daily-orders/marketplace/search?campusId=${campusId}&q=${encodeURIComponent(debounced)}`
			: null,
		fetcher,
	);

	const campusName = campuses?.find((c) => c.id === campusId)?.name;

	if (availabilityLoading || isLoading || !campusId) {
		return (
			<Stack $gap={0}>
				<PageHeader
					eyebrow="Marketplace"
					title="Campus kitchens"
					subtitle="Browse food, prices, ratings and order windows."
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

	if (!marketplaceEnabled || isMarketplaceUnavailable(error)) {
		return (
			<Stack $gap={0}>
				<PageHeader
					eyebrow="Marketplace"
					title="Marketplace unavailable"
					subtitle="Ordering is temporarily paused. Existing paid orders are still being fulfilled."
				/>
				<EmptyState
					icon="pause"
					title="The marketplace is temporarily unavailable"
					description="Please check back later."
				/>
			</Stack>
		);
	}

	const vendors = data ?? [];

	return (
		<Stack $gap={0}>
			<PageHeader
				eyebrow="Marketplace"
				title="Campus kitchens"
				subtitle="Browse vendors near you. Open kitchens appear first; closed kitchens stay visible for menus, prices and ratings."
				actions={<CampusTag>{campusName ?? "Your campus"}</CampusTag>}
			/>

			<SearchWrap>
				<Input
					type="search"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Search shops, dishes or listings near you..."
					aria-label="Search vendors"
				/>
			</SearchWrap>

			{searching ? (
				<SearchResults hits={hits} loading={hitsLoading} q={debounced} />
			) : vendors.length === 0 ? (
				<EmptyState
					icon="food"
					title="No kitchens found here"
					description="There are no eligible vendors in this location yet."
				/>
			) : (
				<VendorGrid vendors={vendors} />
			)}
		</Stack>
	);
}

function VendorGrid({ vendors }: { vendors: MarketplaceVendor[] }) {
	return (
		<Grid $min={260} $gap={16}>
			{vendors.map((row, i) => {
				const primary = row.listings[0];
				const open = row.vendor.isOpenForOrders;
				return (
					<FadeIn key={row.vendor.id} $delay={i * 45}>
						<VendorCard>
							<CardLink href={`/v/${row.vendor.id}`}>
								<Media>
									<BadgeFloat>
										<Badge $tone={open ? "success" : "danger"}>
											{statusLabel(row)}
										</Badge>
									</BadgeFloat>
									<Thumbs>
										{primary?.items.slice(0, 3).map((it) => (
											<Thumb key={it.id} $src={it.snapshotImageUrl}>
												{it.snapshotImageUrl ? "" : "food"}
											</Thumb>
										))}
										{!primary && (
											<Thumb $src={row.vendor.profileImageUrl}>
												{row.vendor.profileImageUrl ? "" : "shop"}
											</Thumb>
										)}
									</Thumbs>
									<MediaShade />
								</Media>
								<Body $gap={10}>
									<Title $size={17}>
										{row.vendor.businessName ?? "Campus kitchen"}
									</Title>
									<Meta>
										Rating {row.vendor.rating.toFixed(1)} / 5 -
										{row.vendor.totalReviews} review
										{row.vendor.totalReviews === 1 ? "" : "s"}
									</Meta>
									<Chips $gap={6}>
										<Badge $tone={open ? "success" : "muted"}>
											{open ? "Accepting orders" : "Closed"}
										</Badge>
										<Badge $tone="gold">
											{vendorPriceRange(row.listings)}
										</Badge>
									</Chips>
									<Foot $justify="space-between" $align="center">
										<Text $size={13} $muted>
											{open
												? fulfillmentLabel(primary)
												: nextOpeningLabel(row.listings)}
										</Text>
										<Cta>View kitchen -&gt;</Cta>
									</Foot>
								</Body>
							</CardLink>
						</VendorCard>
					</FadeIn>
				);
			})}
		</Grid>
	);
}

function SearchResults({
	hits,
	loading,
	q,
}: {
	hits?: VendorSearchHit[];
	loading: boolean;
	q: string;
}) {
	if (loading) {
		return (
			<Stack $gap={12}>
				{[0, 1, 2].map((n) => (
					<Card key={n}>
						<Stack $gap={10}>
							<Skeleton $w="55%" $h={18} />
							<Skeleton $w="35%" $h={13} />
						</Stack>
					</Card>
				))}
			</Stack>
		);
	}
	const results = hits ?? [];
	if (results.length === 0) {
		return (
			<EmptyState
				icon="search"
				title={`No matches for "${q}"`}
				description="Try another shop name, dish or listing."
			/>
		);
	}
	return (
		<Stack $gap={12}>
			<Text $muted $size={13}>
				{results.length} shop{results.length === 1 ? "" : "s"} match "{q}"
			</Text>
			<Row $gap={6} $wrap>
				{Array.from(new Set(results.flatMap((hit) => hit.matchedOn))).map(
					(match) => (
						<MatchTag key={match}>{match}</MatchTag>
					),
				)}
			</Row>
			<VendorGrid vendors={results} />
		</Stack>
	);
}
