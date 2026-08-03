"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
	FiArrowLeft,
	FiArrowRight,
	FiAward,
	FiCheckCircle,
	FiChevronRight,
	FiClock,
	FiHeart,
	FiShare2,
	FiShoppingBag,
	FiStar,
	FiTruck,
} from "react-icons/fi";
import styled from "styled-components";
import useSWR from "swr";
import {
	Badge,
	Button,
	Card,
	EmptyState,
	FadeIn,
	RatingThresholdNote,
	Row,
	Stack,
	Text,
	Title,
	useListingStatus,
	useVendorStatus,
	VendorStatusBadge,
} from "@/components";
import { PageLoader } from "@/components/Loader";
import { fetcher } from "@/constants/fetcher";
import { formatDate, formatKobo } from "@/constants/formatters";
import {
	useSavedKitchens,
	useSavedListings,
} from "@/hooks/useSavedCollections";
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

function menuItemPriceLabel(item: VendorStorefront["menu"][number]): string {
	const activeVariantPrices = (item.variants ?? [])
		.filter((variant) => variant.isActive)
		.map((variant) => variant.priceKobo);
	if (activeVariantPrices.length === 0) return formatKobo(item.priceKobo);
	const min = Math.min(...activeVariantPrices);
	const max = Math.max(...activeVariantPrices);
	return min === max ? formatKobo(min) : `From ${formatKobo(min)}`;
}

function remainingCap(item: DailyOrder["items"][number]): number | null {
	if (item.maxQuantity == null) return null;
	if (typeof item.remainingQuantity === "number") {
		return Math.max(0, item.remainingQuantity);
	}
	return Math.max(
		0,
		item.maxQuantity -
			(item.orderedQuantity ?? 0) -
			(item.reservedQuantity ?? 0),
	);
}

function itemSoldOut(item: DailyOrder["items"][number] | undefined): boolean {
	if (!item) return false;
	if (item.remainingQuantity != null) return item.remainingQuantity <= 0;
	if (item.maxQuantity == null) return false;
	return remainingCap(item) === 0;
}

function menuDescription(
	item: DailyOrder["items"][number] | undefined,
	menu: VendorStorefront["menu"],
	fallback: string,
): string {
	if (!item) return fallback;
	const source = menu.find((m) => m.id === item.menuItemId);
	return source?.description || fallback;
}

function itemPrice(item: DailyOrder["items"][number] | undefined): string {
	if (!item) return "View menu";
	const activeVariantPrices = item.snapshotVariants
		.filter((variant) => variant.isActive !== false)
		.map((variant) => variant.priceKobo);
	if (activeVariantPrices.length > 1) {
		const min = Math.min(...activeVariantPrices);
		const max = Math.max(...activeVariantPrices);
		return min === max ? formatKobo(min) : `From ${formatKobo(min)}`;
	}
	return formatKobo(activeVariantPrices[0] ?? item.snapshotPriceKobo);
}

function heroImage(data: VendorStorefront): string | null | undefined {
	return (
		data.listings.flatMap((listing) => listing.items)[0]
			?.snapshotImageUrl ||
		data.menu.find((item) => item.imageUrl)?.imageUrl ||
		data.vendor.profileImageUrl
	);
}

function listingFulfillment(listing: DailyOrder): string {
	if (listing.pickupAvailable && listing.deliveryAvailable) {
		return "Pickup & Delivery";
	}
	if (listing.deliveryAvailable && listing.deliveryEstimateMinutes) {
		return `Delivery ${listing.deliveryEstimateMinutes} min`;
	}
	if (listing.deliveryAvailable) return "Delivery";
	if (listing.pickupAvailable) return "Pickup";
	return "Order details";
}

function categoryLabel(category: string) {
	return category
		.replace(/[_-]+/g, " ")
		.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isMarketplaceUnavailable(error: unknown): boolean {
	const err = error as {
		response?: { status?: number; data?: { appCode?: string } };
	};
	return (
		err?.response?.status === 503 ||
		err?.response?.data?.appCode === "MARKETPLACE_UNAVAILABLE"
	);
}

const Wrap = styled(Stack)`
  width: min(100%, 1500px);
  margin: 0 auto;
  color: var(--pc-text);
`;

const StorefrontSurface = styled(Stack)`
  position: relative;
  isolation: isolate;

  &::before {
    content: "";
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: -1;
    background:
      radial-gradient(720px 420px at 86% 8%, rgba(255, 90, 31, 0.1), transparent 66%),
      radial-gradient(540px 300px at 5% 22%, rgba(244, 180, 0, 0.06), transparent 64%);
  }
`;

const Hero = styled.section<{ $src?: string | null }>`
  position: relative;
  min-height: 390px;
  overflow: hidden;
  border-radius: 0 0 26px 26px;
  border: 1px solid rgba(255, 90, 31, 0.14);
  background:
    linear-gradient(to bottom, rgba(5, 4, 3, 0.12), rgba(5, 4, 3, 0.98) 76%),
    ${(p) =>
		p.$src
			? `center / cover no-repeat url(${p.$src})`
			: "linear-gradient(135deg, #3b2416, #0d0906)"};

  @media (min-width: 760px) {
    min-height: 430px;
    border-radius: 28px;
  }
`;

const HeroShade = styled.div`
  position: absolute;
  inset: 0;
  background:
    linear-gradient(to bottom, rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.92) 78%),
    radial-gradient(520px 240px at 50% 48%, transparent, rgba(0, 0, 0, 0.52));
`;

const HeroActions = styled.div`
  position: relative;
  z-index: 2;
  display: flex;
  justify-content: space-between;
  padding: 14px;
`;

const ActionGroup = styled.div`
  display: inline-flex;
  gap: 10px;
`;

const IconButton = styled.button<{ $active?: boolean }>`
  width: 44px;
  height: 44px;
  border: 1px solid rgba(255, 244, 225, 0.22);
  border-radius: 50%;
  display: inline-grid;
  place-items: center;
  color: ${(p) => (p.$active ? "var(--pc-color-primary)" : "#fff")};
  background: ${(p) =>
		p.$active ? "rgba(255, 90, 31, 0.16)" : "rgba(12, 8, 5, 0.54)"};
  backdrop-filter: blur(12px);
  cursor: pointer;
  font-size: 20px;

  &:hover {
    border-color: rgba(255, 90, 31, 0.72);
    color: var(--pc-color-primary);
  }
`;

const HeroContent = styled.div`
  position: absolute;
  left: 14px;
  right: 14px;
  bottom: 18px;
  z-index: 2;

  @media (min-width: 760px) {
    left: 6%;
    right: 6%;
    bottom: 38px;
  }
`;

const HeroPanel = styled.div`
  display: grid;
  grid-template-columns: 78px minmax(0, 1fr);
  grid-template-areas:
    "avatar info"
    "stats stats";
  gap: 12px 14px;
  padding: 14px;
  border-radius: 20px;
  border: 1px solid rgba(255, 90, 31, 0.22);
  background:
    linear-gradient(135deg, rgba(31, 20, 13, 0.92), rgba(10, 7, 5, 0.9)),
    color-mix(in srgb, var(--pc-surface) 80%, #000);
  box-shadow: 0 26px 80px rgba(0, 0, 0, 0.42);
  backdrop-filter: blur(18px);

  @media (min-width: 900px) {
    grid-template-columns: 112px minmax(0, 1fr) 170px 150px;
    grid-template-areas: "avatar info rating orders";
    align-items: center;
    gap: 24px;
    padding: 18px 28px;
  }
`;

const HeroIdentity = styled.div`
  grid-area: info;
  display: grid;
  min-width: 0;
`;

const AvatarWrap = styled.div`
  grid-area: avatar;
  position: relative;
  width: 78px;
  height: 78px;

  @media (min-width: 900px) {
    width: 112px;
    height: 112px;
  }
`;

const Avatar = styled.div<{ $src?: string | null }>`
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: 2px solid rgba(255, 244, 225, 0.72);
  background: ${(p) =>
		p.$src
			? `center / cover no-repeat url(${p.$src})`
			: "linear-gradient(135deg, #3b2416, #ff5a1f)"};
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.42);
`;

const NameRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-wrap: nowrap;
`;

const VendorName = styled.h1`
  margin: 0;
  color: #fff;
  font-size: clamp(20px, 5.6vw, 23px);
  line-height: 1.05;
  font-weight: 900;
  letter-spacing: 0;
  min-width: 0;
  flex: 1 1 auto;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  @media (min-width: 900px) {
    font-size: 34px;
  }
`;

const Verified = styled.span`
  display: inline-grid;
  place-items: center;
  position: absolute;
  right: 0;
  bottom: 2px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--pc-color-primary);
  color: #fff;
  font-size: 13px;
  box-shadow: 0 0 0 3px rgba(18, 12, 8, 0.92);

  @media (min-width: 900px) {
    width: 30px;
    height: 30px;
    font-size: 16px;
  }
`;

const CategoryRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 9px;

  @media (min-width: 900px) {
    flex-wrap: nowrap;
    overflow: hidden;
  }
`;

const CategoryPill = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 9px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.86);
  font-size: 11.5px;
  font-weight: 800;
  white-space: nowrap;

  svg {
    color: var(--pc-color-primary);
  }

  @media (min-width: 900px) {
    font-size: 13px;
    padding: 6px 11px;
  }
`;

const Description = styled.p`
  margin: 6px 0 0;
  color: rgba(255, 255, 255, 0.78);
  font-size: 13px;
  line-height: 1.35;
  max-width: 56ch;

  @media (min-width: 900px) {
    font-size: 15.5px;
  }
`;

const MetaItem = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: rgba(255, 255, 255, 0.82);
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;

  svg {
    color: var(--pc-color-primary);
    font-size: 17px;
  }
`;

const StatsGrid = styled.div`
  grid-area: stats;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border-top: 1px solid rgba(255, 255, 255, 0.1);

  @media (min-width: 900px) {
    display: contents;
  }
`;

const StatCell = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 10px 6px 0;
  text-align: center;
  color: rgba(255, 255, 255, 0.72);
  font-size: 11.5px;
  font-weight: 700;

  & + & {
    border-left: 1px solid rgba(255, 255, 255, 0.1);
  }

  @media (min-width: 900px) {
    display: grid;
    justify-items: center;
    padding: 10px 0;
    border-left: 1px solid rgba(255, 255, 255, 0.12);

    & + & {
      border-left: 1px solid rgba(255, 255, 255, 0.12);
    }

    &:first-child {
      grid-area: rating;
    }

    &:last-child {
      grid-area: orders;
    }
  }
`;

const StatValue = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: #fff;
  font-size: 19px;
  font-weight: 900;
  white-space: nowrap;

  svg {
    color: var(--pc-color-gold);
  }

  @media (min-width: 900px) {
    font-size: 24px;
  }
`;

const SectionTop = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  margin: 4px 4px 10px;
`;

const SectionTitle = styled.h2`
  margin: 0;
  color: var(--pc-text);
  font-size: 23px;
  font-weight: 900;
  line-height: 1.05;

  @media (min-width: 760px) {
    font-size: 27px;
  }
`;

const SectionSub = styled.p`
  margin: 4px 0 0;
  color: var(--pc-text-muted);
  font-size: 13.5px;
  font-weight: 600;
`;

const ViewAll = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--pc-color-primary);
  font-size: 14px;
  font-weight: 900;
  white-space: nowrap;
`;

const ViewAllLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--pc-color-primary);
  font-size: 14px;
  font-weight: 900;
  white-space: nowrap;
`;

const CookingList = styled.div`
  display: grid;
  gap: 14px;

  @media (min-width: 620px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (min-width: 920px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  @media (min-width: 1240px) {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
`;

const ListingCard = styled(Card)<{ $disabled?: boolean }>`
  padding: 0;
  overflow: hidden;
  border-radius: 16px;
  border-color: rgba(255, 90, 31, 0.28);
  background: color-mix(in srgb, var(--pc-surface) 88%, #070503);
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.24);
  opacity: ${(p) => (p.$disabled ? 0.68 : 1)};
`;

const StaticCardBody = styled.div`
  color: inherit;
`;

const FoodMedia = styled.div<{ $src?: string | null }>`
  position: relative;
  height: 170px;
  background: ${(p) =>
		p.$src
			? `center / cover no-repeat url(${p.$src})`
			: "linear-gradient(135deg, #3b2416, #ff5a1f)"};

  @media (min-width: 760px) {
    height: 160px;
  }
`;

const ParentLabel = styled.span`
  position: absolute;
  left: 11px;
  bottom: 10px;
  z-index: 2;
  max-width: calc(100% - 22px);
  padding: 5px 9px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.48);
  color: rgba(255, 255, 255, 0.88);
  font-size: 11.5px;
  font-weight: 800;
  backdrop-filter: blur(10px);
`;

const CardStatus = styled.div`
  position: absolute;
  top: 12px;
  right: 12px;
`;

const ListingBody = styled(Stack)`
  padding: 13px 14px 14px;
`;

const ListingHead = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  align-items: start;
`;

const ItemTitle = styled.h3`
  margin: 0;
  color: var(--pc-text);
  font-size: 18px;
  font-weight: 900;
  line-height: 1.1;
`;

const KitchenLine = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-top: 4px;
  color: var(--pc-text-muted);
  font-size: 12px;
  font-weight: 700;
`;

const PriceRating = styled.div`
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  white-space: nowrap;
`;

const Price = styled.span`
  color: var(--pc-text);
  font-size: 18px;
  font-weight: 900;
`;

const RatingMini = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--pc-text);
  font-size: 13px;
  font-weight: 800;

  svg {
    color: var(--pc-color-gold);
  }
`;

const ListingDescription = styled.p`
  margin: 0;
  color: var(--pc-text-muted);
  font-size: 13px;
  line-height: 1.4;
`;

const CardFooter = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 90, 31, 0.16);
`;

const CardActions = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 42px;
  gap: 9px;
`;

const OrderCta = styled(Link)<{ $disabled?: boolean }>`
  display: inline-flex;
  min-height: 42px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border-radius: 11px;
  border: 1px solid ${(p) =>
		p.$disabled ? "rgba(255,255,255,0.08)" : "rgba(255, 90, 31, 0.55)"};
  background: ${(p) =>
		p.$disabled
			? "rgba(255,255,255,0.07)"
			: "linear-gradient(135deg, #ff5a1f, #ff7a2f)"};
  color: ${(p) => (p.$disabled ? "var(--pc-text-muted)" : "#fff")};
  font-size: 13.5px;
  font-weight: 900;
  white-space: nowrap;
  pointer-events: ${(p) => (p.$disabled ? "none" : "auto")};
`;

const HeartButton = styled.button<{ $active?: boolean }>`
  width: 42px;
  min-height: 42px;
  border-radius: 11px;
  border: 1px solid
    ${(p) => (p.$active ? "rgba(255, 90, 31, 0.78)" : "rgba(255,255,255,0.12)")};
  background: ${(p) =>
		p.$active ? "rgba(255, 90, 31, 0.14)" : "rgba(255,255,255,0.05)"};
  color: ${(p) => (p.$active ? "var(--pc-color-primary)" : "#fff")};
  display: inline-grid;
  place-items: center;
  cursor: pointer;
  font-size: 19px;
`;

const Rail = styled.div`
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(155px, 1fr);
  gap: 10px;
  overflow-x: auto;
  padding: 0 4px 4px;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }

  @media (min-width: 760px) {
    grid-auto-columns: 190px;
  }
`;

const MenuCard = styled(Card)`
  padding: 0;
  overflow: hidden;
  border-radius: 12px;
  background: color-mix(in srgb, var(--pc-surface) 88%, #070503);
  border-color: rgba(255, 90, 31, 0.18);
`;

const MenuImage = styled.div<{ $src?: string | null }>`
  height: 94px;
  position: relative;
  background: ${(p) =>
		p.$src
			? `center / cover no-repeat url(${p.$src})`
			: "linear-gradient(135deg, #3b2416, #ff5a1f)"};
`;

const MenuHeart = styled.button<{ $active?: boolean }>`
  position: absolute;
  top: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #fff;
  background: ${(p) =>
		p.$active ? "rgba(255, 90, 31, 0.78)" : "rgba(0, 0, 0, 0.38)"};
  border: 1px solid
    ${(p) => (p.$active ? "rgba(255, 255, 255, 0.36)" : "transparent")};
  cursor: pointer;
`;

const MenuBody = styled(Stack)`
  padding: 9px 10px 10px;
`;

const PillRow = styled(Row)`
  flex-wrap: wrap;
  gap: 5px;
`;

const ReviewsGrid = styled.div`
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(180px, 1fr);
  gap: 10px;
  overflow-x: auto;
  padding: 0 4px 4px;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }

  @media (min-width: 900px) {
    grid-template-columns: repeat(3, 1fr);
    grid-auto-flow: row;
  }
`;

const ReviewCard = styled(Card)`
  padding: 13px;
  border-radius: 13px;
  background: color-mix(in srgb, var(--pc-surface) 88%, #070503);
  border-color: rgba(255, 90, 31, 0.16);
`;

const ReviewerAvatar = styled.span`
  width: 38px;
  height: 38px;
  border-radius: 50%;
  display: inline-grid;
  place-items: center;
  color: #fff;
  background: var(--pc-color-accent-600);
  font-size: 13px;
  font-weight: 900;
`;

function StorefrontListingCard({
	listing,
	item,
	vendorOpen,
	vendorName,
	vendorRating,
	vendorTotalReviews,
	menu,
}: {
	listing: DailyOrder;
	item: DailyOrder["items"][number];
	vendorOpen: boolean;
	vendorName: string;
	vendorRating: number | null | undefined;
	vendorTotalReviews: number | null | undefined;
	menu: VendorStorefront["menu"];
}) {
	const status = useListingStatus(listing, { vendorOpen });
	const savedListings = useSavedListings();
	const soldOut = itemSoldOut(item);
	const canOrder = !!status?.orderable && !soldOut;
	const savedKey = `${listing.shareableToken}:${item.id}`;
	const saved = savedListings.saved.has(savedKey);
	const description = menuDescription(
		item,
		menu,
		"Freshly prepared and ready to order today.",
	);
	return (
		<ListingCard $disabled={!canOrder}>
			<StaticCardBody aria-disabled={!canOrder || undefined}>
				<FoodMedia $src={item?.snapshotImageUrl}>
					<CardStatus>
						{soldOut ? (
							<Badge $tone="danger">Sold out</Badge>
						) : (
							status && (
								<VendorStatusBadge status={status} compact />
							)
						)}
					</CardStatus>
					<ParentLabel>{listing.title}</ParentLabel>
				</FoodMedia>
				<ListingBody $gap={10}>
					<ListingHead>
						<div>
							<ItemTitle>{item.snapshotName}</ItemTitle>
							<KitchenLine>
								<FiShoppingBag aria-hidden />
								{vendorName}
							</KitchenLine>
						</div>
						<PriceRating>
							<Price>{itemPrice(item)}</Price>
							<RatingMini
								aria-label={`Rated ${(vendorRating ?? 0).toFixed(1)} from ${vendorTotalReviews ?? 0} reviews`}
							>
								<FiStar aria-hidden />
								{(vendorRating ?? 0).toFixed(1)}
								<span>({vendorTotalReviews ?? 0})</span>
							</RatingMini>
						</PriceRating>
					</ListingHead>
					<ListingDescription>{description}</ListingDescription>
					<CardFooter>
						<MetaItem>
							<FiClock aria-hidden />
							Prep {item.snapshotPrepMin} min
						</MetaItem>
						<MetaItem>
							{listing.deliveryAvailable ? (
								<FiTruck aria-hidden />
							) : (
								<FiShoppingBag aria-hidden />
							)}
							{listingFulfillment(listing)}
						</MetaItem>
					</CardFooter>
					<CardActions>
						<OrderCta
							href={
								canOrder
									? `/o/${listing.shareableToken}?item=${encodeURIComponent(item.id)}`
									: "#"
							}
							$disabled={!canOrder}
							aria-disabled={!canOrder}
							tabIndex={canOrder ? undefined : -1}
						>
							{canOrder
								? "Order now"
								: soldOut
									? "Sold out"
									: "Unavailable"}
							<FiArrowRight aria-hidden />
						</OrderCta>
						<HeartButton
							type="button"
							$active={saved}
							aria-label={
								saved
									? "Remove listing from favourites"
									: "Save listing"
							}
							onClick={() => savedListings.toggle(savedKey)}
						>
							<FiHeart aria-hidden />
						</HeartButton>
					</CardActions>
				</ListingBody>
			</StaticCardBody>
		</ListingCard>
	);
}

function reviewerInitials(name?: string) {
	const clean = (name || "Buyer").trim();
	const parts = clean.split(/\s+/);
	return `${parts[0]?.[0] ?? "B"}${parts[1]?.[0] ?? ""}`.toUpperCase();
}

export default function VendorStorefrontWrapper({
	vendorId,
}: {
	vendorId: string;
}) {
	const router = useRouter();
	const savedKitchens = useSavedKitchens();
	const savedListings = useSavedListings();
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
	const cookingItems = listings.flatMap((listing) =>
		listing.items.map((item) => ({ listing, item })),
	);
	const vendorName = vendor.businessName ?? "Campus kitchen";
	const reviews = reviewData?.reviews ?? [];
	const heroReviewCount = reviewData?.aggregate.count ?? vendor.totalReviews;
	const heroRating =
		vendor.rating ??
		(heroReviewCount > 0 ? (reviewData?.aggregate.avg ?? null) : null);
	const kitchenSaved = savedKitchens.saved.has(vendor.id);
	const fallbackDescription =
		vendor.description ||
		"Fresh campus meals, prepared with care and served hot.";

	function shareKitchen() {
		const url =
			typeof window !== "undefined"
				? window.location.href
				: `/v/${vendorId}`;
		if (navigator.share) {
			void navigator.share({ title: vendorName, url }).catch(() => {});
			return;
		}
		void navigator.clipboard?.writeText(url).catch(() => {});
	}

	return (
		<Wrap $gap={18}>
			<StorefrontSurface $gap={18}>
				<FadeIn>
					<Hero $src={heroImage(data)}>
						<HeroShade />
						<HeroActions>
							<IconButton
								type="button"
								aria-label="Go back"
								onClick={() => router.back()}
							>
								<FiArrowLeft aria-hidden />
							</IconButton>
							<ActionGroup>
								<IconButton
									type="button"
									aria-label="Share kitchen"
									onClick={shareKitchen}
								>
									<FiShare2 aria-hidden />
								</IconButton>
								<IconButton
									type="button"
									aria-label={
										kitchenSaved
											? "Remove kitchen from saved"
											: "Save kitchen"
									}
									$active={kitchenSaved}
									onClick={() =>
										savedKitchens.toggle(vendor.id)
									}
								>
									<FiHeart aria-hidden />
								</IconButton>
							</ActionGroup>
						</HeroActions>
						<HeroContent>
							<HeroPanel>
								<AvatarWrap>
									<Avatar
										$src={vendor.profileImageUrl}
										aria-hidden
									/>
									<Verified aria-label="Verified kitchen">
										<FiCheckCircle aria-hidden />
									</Verified>
								</AvatarWrap>
								<HeroIdentity>
									<NameRow>
										<VendorName>{vendorName}</VendorName>
										<VendorStatusBadge
											status={vendorStatus}
											compact
											live
										/>
									</NameRow>
									<Description>
										{fallbackDescription}
									</Description>
									{vendor.categories.length > 0 && (
										<CategoryRow>
											{vendor.categories.map(
												(category) => (
													<CategoryPill
														key={category}
													>
														<FiAward aria-hidden />
														{categoryLabel(
															category,
														)}
													</CategoryPill>
												),
											)}
										</CategoryRow>
									)}
								</HeroIdentity>
								<StatsGrid>
									<StatCell>
										<StatValue>
											<FiStar aria-hidden />
											{heroRating == null
												? "New"
												: heroRating.toFixed(1)}
										</StatValue>
										({heroReviewCount} review
										{heroReviewCount === 1 ? "" : "s"})
									</StatCell>
									<StatCell>
										<StatValue>
											<FiShoppingBag aria-hidden />
											{vendor.totalOrders}
										</StatValue>
										Total orders
									</StatCell>
								</StatsGrid>
							</HeroPanel>
						</HeroContent>
					</Hero>
				</FadeIn>

				<Stack $gap={12} id="cooking-today">
					<SectionTop>
						<div>
							<SectionTitle>Cooking Today</SectionTitle>
							<SectionSub>Ready to order now</SectionSub>
						</div>
						<ViewAllLink href="#cooking-today">
							View all <FiChevronRight aria-hidden />
						</ViewAllLink>
					</SectionTop>
					{cookingItems.length === 0 ? (
						<EmptyState
							icon="pause"
							title="Nothing cooking right now"
							description="This kitchen has no open listings at the moment. Check back later."
						/>
					) : (
						<CookingList>
							{cookingItems.map(({ listing, item }, i) => (
								<FadeIn
									key={`${listing.id}-${item.id}`}
									$delay={i * 45}
								>
									<StorefrontListingCard
										listing={listing}
										item={item}
										vendorOpen={vendor.isOpenForOrders}
										vendorName={vendorName}
										vendorRating={vendor.rating}
										vendorTotalReviews={vendor.totalReviews}
										menu={menu}
									/>
								</FadeIn>
							))}
						</CookingList>
					)}
				</Stack>

				<Stack $gap={10} id="full-menu">
					<SectionTop>
						<div>
							<SectionTitle>Full Menu</SectionTitle>
							<SectionSub>Dishes we usually cook</SectionSub>
						</div>
						<ViewAllLink href="#full-menu">
							View all <FiChevronRight aria-hidden />
						</ViewAllLink>
					</SectionTop>
					{menu.length === 0 ? (
						<EmptyState
							icon="menu"
							title="No menu items yet"
							description="This kitchen has not published its menu."
						/>
					) : (
						<Rail>
							{menu.map((item) => (
								<MenuCard key={item.id}>
									<MenuImage $src={item.imageUrl}>
										<MenuHeart
											type="button"
											$active={savedListings.saved.has(
												`menu:${item.id}`,
											)}
											aria-label={
												savedListings.saved.has(
													`menu:${item.id}`,
												)
													? "Remove menu item from favourites"
													: "Save menu item"
											}
											onClick={() =>
												savedListings.toggle(
													`menu:${item.id}`,
												)
											}
										>
											<FiHeart aria-hidden />
										</MenuHeart>
									</MenuImage>
									<MenuBody $gap={6}>
										<Text $weight={800} $size={13.5}>
											{item.name}
										</Text>
										<PillRow>
											<Badge $tone="gold">
												{item.category}
											</Badge>
											<Badge $tone="success">
												{item.isAvailable &&
												!item.isSoldOut
													? "Often cooked"
													: item.isSoldOut
														? "Sold out"
														: "Unavailable"}
											</Badge>
										</PillRow>
										<Text $weight={800} $size={13}>
											{menuItemPriceLabel(item)}
										</Text>
									</MenuBody>
								</MenuCard>
							))}
						</Rail>
					)}
				</Stack>

				<Stack $gap={10}>
					<SectionTop>
						<div>
							<SectionTitle>
								Reviews{" "}
								<FiStar
									aria-hidden
									style={{ color: "var(--pc-color-gold)" }}
								/>
							</SectionTitle>
							<SectionSub>
								{reviewData?.aggregate.count ??
									vendor.totalReviews}{" "}
								review
								{(reviewData?.aggregate.count ??
									vendor.totalReviews) === 1
									? ""
									: "s"}
							</SectionSub>
						</div>
						<ViewAll>
							View all <FiChevronRight aria-hidden />
						</ViewAll>
					</SectionTop>
					{reviews.length === 0 ? (
						<EmptyState
							icon="star"
							title="No reviews yet"
							description="Buyer reviews will appear here after completed orders."
						/>
					) : (
						<Stack $gap={8}>
							<RatingThresholdNote
								totalReviews={vendor.totalReviews}
							/>
							<ReviewsGrid>
								{reviews.map((review) => (
									<ReviewCard key={review.id}>
										<Stack $gap={8}>
											<Row $gap={9} $align="center">
												<ReviewerAvatar>
													{reviewerInitials(
														review.buyerName,
													)}
												</ReviewerAvatar>
												<div>
													<Text
														$weight={800}
														$size={13.5}
													>
														{review.buyerName ||
															"Buyer"}
													</Text>
													<RatingMini>
														<FiStar aria-hidden />
														{review.rating.toFixed(
															1,
														)}
													</RatingMini>
												</div>
											</Row>
											{review.comment && (
												<Text $size={13}>
													{review.comment}
												</Text>
											)}
											<Text $muted $size={11.5}>
												{formatDate(review.createdAt)}
											</Text>
										</Stack>
									</ReviewCard>
								))}
							</ReviewsGrid>
						</Stack>
					)}
				</Stack>
			</StorefrontSurface>
		</Wrap>
	);
}
