"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import styled from "styled-components";
import useSWR from "swr";
import {
	Badge,
	Button,
	Card,
	EmptyState,
	FadeIn,
	Grid,
	RatingThresholdNote,
	Row,
	SectionHeader,
	Stack,
	Text,
	Title,
	useListingStatus,
	useVendorStatus,
	VendorRating,
	VendorStatusBadge,
} from "@/components";
import { PageLoader } from "@/components/Loader";
import { fetcher } from "@/constants/fetcher";
import { formatDate, formatKobo } from "@/constants/formatters";
import type { DailyOrder, VendorStorefront } from "@/types";

interface ReviewResponse {
	reviews: Array<{
		id: string;
		buyerName?: string;
		rating: number;
		comment?: string;
		createdAt: string;
	}>;
	aggregate: { avg: number; count: number };
}
interface MarketplaceAvailability {
	marketplaceEnabled: boolean;
}

const Wrap = styled(Stack)`
	max-width: 720px;
	margin: 0 auto;
`;
const Header = styled(Card)`
	background: var(--pc-gradient-hero);
	border: none;
	color: #fff;
	box-shadow: var(--pc-shadow-primary);
`;
const Avatar = styled.div<{ $src?: string | null }>`
	width: 68px;
	height: 68px;
	flex: 0 0 auto;
	border-radius: 999px;
	background: ${(p) =>
		p.$src
			? `center / cover no-repeat url(${p.$src})`
			: "rgba(255,255,255,0.2)"};
	display: grid;
	place-items: center;
	font-size: 32px;
`;
const CatChips = styled(Row)`
	flex-wrap: wrap;
`;
const CatChip = styled.span`
	display: inline-flex;
	padding: 4px 10px;
	border-radius: var(--pc-radius-pill);
	background: rgba(255, 255, 255, 0.18);
	font-size: 12px;
	font-weight: 700;
	color: #fff;
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
const Thumbs = styled.div`
	display: flex;
	gap: 2px;
	height: 130px;
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
	font-size: 30px;
`;
const Body = styled(Stack)`
	padding: var(--pc-space-4);
	flex: 1;
`;
const MenuRow = styled(Row)`
	justify-content: space-between;
	align-items: center;
	gap: 12px;
	padding: var(--pc-space-3) 0;
	border-bottom: 1px solid var(--pc-border);
	&:last-child {
		border-bottom: none;
	}
`;
const MenuThumb = styled.div<{ $src?: string }>`
	width: 46px;
	height: 46px;
	flex: 0 0 auto;
	border-radius: var(--pc-radius-sm);
	background: ${(p) =>
		p.$src
			? `center / cover no-repeat url(${p.$src})`
			: "var(--pc-color-primary-50)"};
	display: grid;
	place-items: center;
	font-size: 22px;
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

/**
 * A single "cooking today" listing tile.
 *
 * Its own component so it can hold a live `useListingStatus` subscription. This
 * replaces an inline `closed`/`comingSoon` pair that never consulted the
 * vendor's `isOpenForOrders` kill switch and never re-derived — a kitchen that
 * had switched itself off still rendered "⏱ 2h left" here.
 */
function StorefrontListingCard({
	listing,
	vendorOpen,
}: {
	listing: DailyOrder;
	vendorOpen: boolean;
}) {
	const status = useListingStatus(listing, { vendorOpen });

	return (
		<ListingCard>
			<CardLink href={`/o/${listing.shareableToken}`}>
				<Thumbs>
					{listing.items.slice(0, 3).map((it) => (
						<Thumb key={it.id} $src={it.snapshotImageUrl}>
							{it.snapshotImageUrl ? "" : "🍲"}
						</Thumb>
					))}
					{listing.items.length === 0 && <Thumb>🍲</Thumb>}
				</Thumbs>
				<Body $gap={10}>
					<Title $size={16}>{listing.title}</Title>
					<Row $justify="space-between" $align="center">
						{status && (
							<VendorStatusBadge status={status} compact />
						)}
						<Badge $tone="muted">
							{listing.items.length} item
							{listing.items.length === 1 ? "" : "s"}
						</Badge>
					</Row>
				</Body>
			</CardLink>
		</ListingCard>
	);
}

export default function VendorStorefrontWrapper({
	vendorId,
}: {
	vendorId: string;
}) {
	const router = useRouter();
	const { data: availability, isLoading: availabilityLoading } =
		useSWR<MarketplaceAvailability>("/site-configs/marketplace", fetcher, {
			refreshInterval: 10_000,
		});
	const marketplaceEnabled = availability?.marketplaceEnabled !== false;
	const { data, isLoading, error } = useSWR<VendorStorefront>(
		marketplaceEnabled ? `/vendors/${vendorId}/storefront` : null,
		fetcher,
	);
	const { data: reviewData } = useSWR<ReviewResponse>(
		marketplaceEnabled ? `/vendors/${vendorId}/reviews` : null,
		fetcher,
	);
	// Declared before the early returns — hooks can't live behind a branch. Ticks
	// every 30s, so the hero badge decays on its own instead of going stale.
	const vendorStatus = useVendorStatus({
		isOpenForOrders: data?.vendor.isOpenForOrders,
		listings: data?.listings,
	});

	if (availabilityLoading || isLoading) return <PageLoader />;
	if (!marketplaceEnabled || isMarketplaceUnavailable(error)) {
		return (
			<Wrap>
				<Card $accent>
					<Stack $gap={10}>
						<Title $size={20}>Marketplace unavailable</Title>
						<Text $muted>
							The marketplace is temporarily unavailable. Existing
							paid orders are still being fulfilled.
						</Text>
						<Row>
							<Button onClick={() => router.push("/my-orders")}>
								View my orders
							</Button>
						</Row>
					</Stack>
				</Card>
			</Wrap>
		);
	}
	if (error || !data) {
		return (
			<Wrap>
				<Card $accent>
					<Stack $gap={10}>
						<Title $size={20}>Shop not found</Title>
						<Text $muted>
							This vendor may no longer be active, or the link is
							invalid.
						</Text>
						<Row>
							<Button onClick={() => router.push("/marketplace")}>
								Browse marketplace
							</Button>
						</Row>
					</Stack>
				</Card>
			</Wrap>
		);
	}

	const { vendor, listings, menu } = data;

	return (
		<Wrap $gap={18}>
			<FadeIn>
				<Header>
					<Row $gap={16} $align="center">
						<Avatar $src={vendor.profileImageUrl} aria-hidden>
							{vendor.profileImageUrl ? "" : "🏪"}
						</Avatar>
						<Stack $gap={6}>
							<Text
								$weight={800}
								$size={22}
								style={{ color: "#fff" }}
							>
								{vendor.businessName ?? "Campus kitchen"}
							</Text>
							{/* Availability first, then trust — two orthogonal
							    axes, never more than two badges. `onHero` swaps
							    the tone tokens for a scrim that survives the
							    gradient. */}
							<Row $gap={10} $align="center" $wrap>
								<VendorStatusBadge
									status={vendorStatus}
									onHero
									live
								/>
								<VendorRating
									rating={vendor.rating}
									totalReviews={vendor.totalReviews}
									onHero
								/>
								<Text
									$size={13}
									style={{ color: "rgba(255,255,255,0.92)" }}
								>
									🍽️ {vendor.totalOrders} orders
								</Text>
							</Row>
							{(vendor.areaOrAddress || vendor.state) && (
								<Text
									$size={13}
									style={{ color: "rgba(255,255,255,0.85)" }}
								>
									📍{" "}
									{[vendor.areaOrAddress, vendor.state]
										.filter(Boolean)
										.join(", ")}
								</Text>
							)}
						</Stack>
					</Row>
					{vendor.description && (
						<Text
							$size={14}
							style={{
								color: "rgba(255,255,255,0.9)",
								marginTop: 12,
							}}
						>
							{vendor.description}
						</Text>
					)}
					{vendor.categories.length > 0 && (
						<CatChips $gap={6} style={{ marginTop: 12 }}>
							{vendor.categories.map((c) => (
								<CatChip key={c}>{c}</CatChip>
							))}
						</CatChips>
					)}
				</Header>
			</FadeIn>

			<Stack $gap={12}>
				<SectionHeader title="Cooking today" icon="🔥" />
				{listings.length === 0 ? (
					<EmptyState
						icon="😴"
						title="Nothing cooking right now"
						description="This kitchen has no open listings at the moment. Check back later."
					/>
				) : (
					<Grid $min={240} $gap={16}>
						{listings.map((o, i) => (
							<FadeIn key={o.id} $delay={i * 45}>
								<StorefrontListingCard
									listing={o}
									vendorOpen={vendor.isOpenForOrders}
								/>
							</FadeIn>
						))}
					</Grid>
				)}
			</Stack>

			<Stack $gap={12}>
				<SectionHeader title="Full menu" icon="🍽️" />
				{menu.length === 0 ? (
					<EmptyState
						icon="📭"
						title="No menu items yet"
						description="This kitchen hasn't published its menu."
					/>
				) : (
					<Card>
						<Stack $gap={0}>
							{menu.map((m) => (
								<MenuRow key={m.id}>
									<Row $gap={12} $align="center">
										<MenuThumb
											$src={m.imageUrl}
											aria-hidden
										>
											{m.imageUrl ? "" : "🍛"}
										</MenuThumb>
										<Stack $gap={2}>
											<Text $weight={700}>{m.name}</Text>
											{m.description && (
												<Text $muted $size={12.5}>
													{m.description}
												</Text>
											)}
										</Stack>
									</Row>
									<Text $weight={700}>
										{formatKobo(m.priceKobo)}
									</Text>
								</MenuRow>
							))}
						</Stack>
					</Card>
				)}
			</Stack>

			<Stack $gap={12}>
				<SectionHeader title="Reviews" icon="★" />
				{(reviewData?.reviews ?? []).length === 0 ? (
					<EmptyState
						icon="★"
						title="No reviews yet"
						description="Buyer reviews will appear here after completed orders."
					/>
				) : (
					<Stack $gap={10}>
						{/* Says out loud why no public score is shown yet, so a
						    below-threshold vendor doesn't read as un-rated. */}
						<RatingThresholdNote
							totalReviews={vendor.totalReviews}
						/>
						{(reviewData?.reviews ?? []).map((r) => (
							<Card key={r.id}>
								<Stack $gap={6}>
									<Row $justify="space-between" $gap={10}>
										<Text $weight={700}>
											{r.buyerName || "Buyer"}
										</Text>
										<Text $weight={800}>
											{"★".repeat(r.rating)}
										</Text>
									</Row>
									{r.comment && (
										<Text $size={14}>{r.comment}</Text>
									)}
									<Text $muted $size={12}>
										{formatDate(r.createdAt)}
									</Text>
								</Stack>
							</Card>
						))}
					</Stack>
				)}
			</Stack>
		</Wrap>
	);
}
