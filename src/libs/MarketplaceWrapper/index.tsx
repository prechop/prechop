"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
	useVendorStatus,
	VendorStatusBadge,
} from "@/components";
import { fetcher } from "@/constants/fetcher";
import { formatKobo } from "@/constants/formatters";
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

const KNOWN_CAMPUS_COORDS: Record<
	string,
	{ latitude: number; longitude: number }
> = {
	UI: { latitude: 7.443, longitude: 3.9 },
	"UNIVERSITY OF IBADAN": { latitude: 7.443, longitude: 3.9 },
	UNILAG: { latitude: 6.5158, longitude: 3.3899 },
	"UNIVERSITY OF LAGOS": { latitude: 6.5158, longitude: 3.3899 },
};

const MAX_LOCATION_ACCURACY_METERS = 5_000;
const NEARBY_CAMPUS_RADIUS_METERS = 10_000;

const CampusPickerWrap = styled.div`
	display: flex;
	gap: 10px;
	align-items: center;
	flex-wrap: wrap;
	justify-content: flex-end;
`;
const CampusSelect = styled.select`
	min-width: min(100%, 220px);
	height: 40px;
	border: 1px solid var(--pc-border);
	border-radius: var(--pc-radius-pill);
	background: var(--pc-surface);
	color: var(--pc-text);
	font: inherit;
	font-weight: 700;
	font-size: 13px;
	padding: 0 34px 0 14px;
	outline: none;
	&:focus {
		border-color: var(--pc-color-primary);
		box-shadow: 0 0 0 3px var(--pc-color-primary-50);
	}
`;
const Notice = styled.div`
	margin: 0 0 var(--pc-space-3);
	color: var(--pc-color-primary);
	font-size: 13px;
	font-weight: 700;
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
	position: relative;
	flex: 1;
	background: ${(p) =>
		p.$src
			? `center / cover no-repeat url(${p.$src})`
			: "radial-gradient(circle at 50% 42%, rgba(255, 255, 255, 0.72) 0 22px, transparent 23px), linear-gradient(135deg, var(--pc-color-gold) 0%, var(--pc-color-primary) 100%)"};
	display: flex;
	align-items: center;
	justify-content: center;
	overflow: hidden;
	&::before {
		content: "";
		position: absolute;
		width: 54px;
		height: 54px;
		border-radius: 50%;
		background: var(--pc-surface);
		box-shadow: inset 0 0 0 7px rgba(255, 255, 255, 0.68), 0 10px 24px rgba(0, 0, 0, 0.18);
		opacity: ${(p) => (p.$src ? 0 : 1)};
	}
	&::after {
		content: "";
		position: absolute;
		width: 30px;
		height: 18px;
		border-radius: 50%;
		background: var(--pc-color-primary);
		box-shadow: 12px -8px 0 -4px var(--pc-color-gold), -10px 7px 0 -5px var(--pc-color-gold-ink);
		opacity: ${(p) => (p.$src ? 0 : 1)};
	}
`;
const MediaShade = styled.div`
	position: absolute;
	inset: 0;
	pointer-events: none;
	background: linear-gradient(to top, rgba(0, 0, 0, 0.28), transparent 55%);
`;
const ThumbLabel = styled.span`
	position: absolute;
	left: 0;
	right: 0;
	bottom: 0;
	z-index: 1;
	padding: 20px 8px 7px;
	background: linear-gradient(to top, rgba(0, 0, 0, 0.72), transparent);
	color: #fff;
	font-size: 12px;
	font-weight: 800;
	line-height: 1.15;
	text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55);
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
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
const RatingPill = styled.span`
	display: inline-flex;
	align-items: center;
	gap: 5px;
	border-radius: var(--pc-radius-pill);
	background: var(--pc-surface-2);
	border: 1px solid var(--pc-border);
	color: var(--pc-text);
	font-size: 13px;
	font-weight: 800;
	padding: 5px 9px;
	white-space: nowrap;
`;
const RatingStar = styled.span`
	color: var(--pc-color-gold-ink);
	font-size: 13px;
	line-height: 1;
`;
const RatingCount = styled.span`
	color: var(--pc-text-muted);
	font-weight: 700;
`;
const MarketIllustration = styled.div`
	width: 72px;
	height: 64px;
	position: relative;
	&::before {
		content: "";
		position: absolute;
		left: 10px;
		right: 10px;
		bottom: 0;
		height: 40px;
		border-radius: 8px;
		background: var(--pc-surface-2);
		border: 1px solid var(--pc-border);
		box-shadow: inset 0 12px 0 var(--pc-color-primary-50);
	}
	&::after {
		content: "";
		position: absolute;
		left: 4px;
		right: 4px;
		top: 6px;
		height: 22px;
		border-radius: 12px 12px 5px 5px;
		background: repeating-linear-gradient(
			90deg,
			var(--pc-color-primary) 0 12px,
			var(--pc-color-gold) 12px 24px
		);
		box-shadow: 0 8px 18px rgba(0, 0, 0, 0.16);
	}
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

function activeMenuItems(listings: DailyOrder[]): DailyOrder["items"] {
	const seen = new Set<string>();
	const items: DailyOrder["items"] = [];
	for (const item of listings.flatMap((listing) => listing.items)) {
		const key = item.menuItemId || item.id;
		if (seen.has(key)) continue;
		seen.add(key);
		items.push(item);
	}
	return items;
}

function menuSummary(total: number): string {
	if (total <= 0) return "Menu available";
	if (total > 3) return `3 of ${total} menus`;
	return `${total} menu${total === 1 ? "" : "s"} available`;
}

function fulfillmentLabel(listings: DailyOrder[]): string {
	if (listings.length === 0) return "Menu, prices and ratings";
	const pickupAvailable = listings.some((listing) => listing.pickupAvailable);
	const deliveryAvailable = listings.some(
		(listing) => listing.deliveryAvailable,
	);
	return [
		pickupAvailable ? "Pickup" : null,
		deliveryAvailable ? "Delivery" : null,
	]
		.filter(Boolean)
		.join(" / ");
}

function ratingText(rating: number | null | undefined): string {
	return (rating ?? 0).toFixed(1);
}

function campusCoordinate(campus: Campus) {
	return (
		KNOWN_CAMPUS_COORDS[campus.shortCode?.toUpperCase()] ??
		KNOWN_CAMPUS_COORDS[campus.name?.toUpperCase()]
	);
}

function distanceMeters(
	a: { latitude: number; longitude: number },
	b: { latitude: number; longitude: number },
): number {
	const radius = 6_371_000;
	const toRad = (value: number) => (value * Math.PI) / 180;
	const dLat = toRad(b.latitude - a.latitude);
	const dLng = toRad(b.longitude - a.longitude);
	const lat1 = toRad(a.latitude);
	const lat2 = toRad(b.latitude);
	const h =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
	return 2 * radius * Math.asin(Math.sqrt(h));
}

function nearestSupportedCampus(
	campuses: Campus[],
	position: GeolocationPosition,
): Campus | null {
	if (position.coords.accuracy > MAX_LOCATION_ACCURACY_METERS) return null;
	const here = {
		latitude: position.coords.latitude,
		longitude: position.coords.longitude,
	};
	const nearest = campuses
		.map((campus) => {
			const coords = campusCoordinate(campus);
			return coords
				? { campus, distance: distanceMeters(here, coords) }
				: null;
		})
		.filter((item): item is { campus: Campus; distance: number } => !!item)
		.sort((a, b) => a.distance - b.distance)[0];
	return nearest?.distance <= NEARBY_CAMPUS_RADIUS_METERS
		? nearest.campus
		: null;
}

function CampusFilter({
	campuses,
	value,
	onChange,
}: {
	campuses: Campus[];
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<CampusPickerWrap>
			<CampusSelect
				value={value}
				onChange={(event) => onChange(event.target.value)}
				aria-label="Filter marketplace by campus"
			>
				<option value="">All campuses</option>
				{campuses.map((campus) => (
					<option key={campus.id} value={campus.id}>
						{campus.name}
					</option>
				))}
			</CampusSelect>
		</CampusPickerWrap>
	);
}

export default function MarketplaceWrapper() {
	const { user, isLoading: authLoading } = useAuth();
	const { data: campuses, isLoading: campusesLoading } = useSWR<Campus[]>(
		"/campuses",
		fetcher,
	);
	const [selectedCampusId, setSelectedCampusId] = useState("");
	const [locationNotice, setLocationNotice] = useState("");
	const manualCampusRef = useRef(false);
	const locationRequestedRef = useRef(false);
	const { data: availability, isLoading: availabilityLoading } =
		useSWR<MarketplaceAvailability>("/site-configs/marketplace", fetcher, {
			refreshInterval: 10_000,
		});
	const marketplaceEnabled = availability?.marketplaceEnabled !== false;
	const campusQuery = selectedCampusId ? `campusId=${selectedCampusId}&` : "";
	const { data, isLoading, error } = useSWR<MarketplaceVendor[]>(
		marketplaceEnabled
			? `/daily-orders/marketplace?${campusQuery}limit=50`
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
	const searchCampusQuery = selectedCampusId
		? `campusId=${selectedCampusId}&`
		: "";
	const { data: hits, isLoading: hitsLoading } = useSWR<VendorSearchHit[]>(
		marketplaceEnabled && searching
			? `/daily-orders/marketplace/search?${searchCampusQuery}q=${encodeURIComponent(debounced)}`
			: null,
		fetcher,
	);

	const campusName = campuses?.find((c) => c.id === selectedCampusId)?.name;
	const activeCampuses = campuses ?? [];

	useEffect(() => {
		if (!user?.campusId || manualCampusRef.current) return;
		setSelectedCampusId(user.campusId);
	}, [user?.campusId]);

	useEffect(() => {
		if (
			user ||
			locationRequestedRef.current ||
			manualCampusRef.current ||
			activeCampuses.length === 0 ||
			!("geolocation" in navigator)
		) {
			return;
		}
		locationRequestedRef.current = true;
		navigator.geolocation.getCurrentPosition(
			(position) => {
				if (manualCampusRef.current) return;
				const campus = nearestSupportedCampus(activeCampuses, position);
				if (!campus) return;
				setSelectedCampusId(campus.id);
				setLocationNotice(`Showing vendors near ${campus.name}.`);
			},
			() => {},
			{
				enableHighAccuracy: false,
				timeout: 6_000,
				maximumAge: 10 * 60 * 1000,
			},
		);
	}, [activeCampuses, user]);

	function handleCampusChange(value: string) {
		manualCampusRef.current = true;
		setLocationNotice("");
		setSelectedCampusId(value);
	}

	if (availabilityLoading || authLoading || campusesLoading || isLoading) {
		return (
			<Stack $gap={0}>
				<PageHeader
					eyebrow="Marketplace"
					title="Campus kitchens"
					subtitle="Browse food, prices, ratings and order windows."
					actions={
						<CampusFilter
							campuses={activeCampuses}
							value={selectedCampusId}
							onChange={handleCampusChange}
						/>
					}
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
				subtitle="Browse vendors across campuses. Open kitchens appear first; closed kitchens stay visible for menus, prices and ratings."
				actions={
					<CampusFilter
						campuses={activeCampuses}
						value={selectedCampusId}
						onChange={handleCampusChange}
					/>
				}
			/>
			{locationNotice && <Notice>{locationNotice}</Notice>}
			{campusName && !locationNotice && (
				<Notice>Showing vendors near {campusName}.</Notice>
			)}

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
				<SearchResults
					hits={hits}
					loading={hitsLoading}
					q={debounced}
				/>
			) : vendors.length === 0 ? (
				<EmptyState
					icon={<MarketIllustration />}
					title="No kitchens found here"
					description="There are no eligible vendors in this location yet."
				/>
			) : (
				<VendorGrid vendors={vendors} />
			)}
		</Stack>
	);
}

/**
 * One marketplace card. Split out of `VendorGrid` so each row can hold its own
 * live `useVendorStatus` subscription — the badge re-derives on a 30s tick, so
 * a card that says "Closing soon · 12m" decays to "Closed today" on its own
 * rather than lying until the next refetch.
 *
 * Availability lives in the media corner; the body keeps the shop name and
 * numeric rating together so the card scans like a marketplace listing.
 */
function VendorGridCard({ row }: { row: MarketplaceVendor }) {
	const primary = row.listings[0];
	const menus = activeMenuItems(row.listings);
	const previewMenus = menus.slice(0, 3);
	const vendorId = row.vendor.id || primary?.vendorId;
	const status = useVendorStatus({
		isOpenForOrders: row.vendor.isOpenForOrders,
		listings: row.listings,
	});

	return (
		<VendorCard>
			<CardLink href={vendorId ? `/v/${vendorId}` : "/marketplace"}>
				<Media>
					<BadgeFloat>
						<VendorStatusBadge status={status} compact />
					</BadgeFloat>
					<Thumbs>
						{previewMenus.map((it) => (
							<Thumb
								key={it.id}
								$src={it.snapshotImageUrl}
								aria-label={
									it.snapshotImageUrl
										? it.snapshotName
										: `${it.snapshotName} image placeholder`
								}
							>
								<ThumbLabel>{it.snapshotName}</ThumbLabel>
							</Thumb>
						))}
						{previewMenus.length === 0 && (
							<Thumb
								$src={row.vendor.profileImageUrl}
								aria-label={
									row.vendor.profileImageUrl
										? (row.vendor.businessName ??
											"Campus kitchen")
										: "Kitchen image placeholder"
								}
							/>
						)}
					</Thumbs>
					<MediaShade />
				</Media>
				<Body $gap={10}>
					<Row $justify="space-between" $align="center" $gap={8}>
						<Title $size={17}>
							{row.vendor.businessName ?? "Campus kitchen"}
						</Title>
						<RatingPill
							aria-label={`Rated ${ratingText(row.vendor.rating)} out of 5 from ${row.vendor.totalReviews} reviews`}
						>
							<RatingStar aria-hidden>★</RatingStar>
							{ratingText(row.vendor.rating)}
							<RatingCount aria-hidden>
								({row.vendor.totalReviews})
							</RatingCount>
						</RatingPill>
					</Row>
					<Chips $gap={6}>
						<Badge $tone="gold">
							{vendorPriceRange(row.listings)}
						</Badge>
						<Badge $tone="muted">{menuSummary(menus.length)}</Badge>
					</Chips>
					<Foot $justify="space-between" $align="center">
						<Text $size={13} $muted>
							{fulfillmentLabel(row.listings)}
						</Text>
						<Cta>View kitchen -&gt;</Cta>
					</Foot>
				</Body>
			</CardLink>
		</VendorCard>
	);
}

function VendorGrid({ vendors }: { vendors: MarketplaceVendor[] }) {
	return (
		<Grid $min={260} $gap={16}>
			{vendors.map((row, i) => (
				<FadeIn key={row.vendor.id} $delay={i * 45}>
					<VendorGridCard row={row} />
				</FadeIn>
			))}
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
				{results.length} shop{results.length === 1 ? "" : "s"} match "
				{q}"
			</Text>
			<Row $gap={6} $wrap>
				{Array.from(
					new Set(results.flatMap((hit) => hit.matchedOn)),
				).map((match) => (
					<MatchTag key={match}>{match}</MatchTag>
				))}
			</Row>
			<VendorGrid vendors={results} />
		</Stack>
	);
}
