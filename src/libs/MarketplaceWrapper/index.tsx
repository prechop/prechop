"use client";

import Link from "next/link";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FiCheckCircle,
  FiChevronLeft,
  FiChevronRight,
  FiClock,
  FiGrid,
  FiSearch,
  FiShoppingBag,
  FiStar,
  FiTruck,
} from "react-icons/fi";
import styled from "styled-components";
import useSWR, { mutate as globalMutate } from "swr";
import {
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
import { api } from "@/constants/api";
import { fetcher } from "@/constants/fetcher";
import { formatKobo } from "@/constants/formatters";
import {
  MENU_CATEGORIES,
  type MenuCategoryValue,
  normalizeMenuCategory,
} from "@/constants/menuCategories";
import { useAuth } from "@/hooks/Auth/useAuth";
import { useToast } from "@/hooks/useToast";
import type {
  Campus,
  DailyOrder,
  MarketplaceVendor,
  PublicUser,
  VendorSearchHit,
} from "@/types";

interface MarketplaceAvailability {
  marketplaceEnabled: boolean;
}

type CategoryFilterValue = "ALL" | MenuCategoryValue;

const MARKETPLACE_CATEGORY_LABELS: Record<MenuCategoryValue, string> = {
  MEALS: "Meals",
  FAST_FOOD_GRILLS: "Grills",
  SNACKS_PASTRIES: "Snacks",
  CAKES_DESSERTS: "Cakes",
  DRINKS: "Drinks",
};

const CATEGORY_TABS: Array<{
  value: CategoryFilterValue;
  label: string;
  icon: React.ReactNode;
}> = [
  { value: "ALL", label: "All", icon: <FiGrid /> },
  ...MENU_CATEGORIES.map((category) => ({
    value: category.value,
    label: MARKETPLACE_CATEGORY_LABELS[category.value],
    icon: category.icon,
  })),
];

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
  border: 1px solid rgba(255, 90, 31, 0.18);
  border-radius: var(--pc-radius-pill);
  background: color-mix(in srgb, var(--pc-surface) 74%, #080604);
  color: var(--pc-text);
  font: inherit;
  font-weight: 700;
  font-size: 13px;
  padding: 0 34px 0 14px;
  outline: none;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
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
  position: relative;
  border-radius: 18px;
  background:
    linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.025),
      rgba(255, 90, 31, 0.035)
    ),
    color-mix(in srgb, var(--pc-surface) 88%, #070503);
  border-color: rgba(255, 90, 31, 0.24);
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.24);
  transition:
    box-shadow var(--pc-dur) var(--pc-ease),
    border-color var(--pc-dur) var(--pc-ease),
    transform var(--pc-dur) var(--pc-ease);
  &:hover {
    border-color: rgba(255, 90, 31, 0.56);
    box-shadow: 0 22px 58px rgba(0, 0, 0, 0.34);
    transform: translateY(-2px);
  }
`;
const Media = styled.div`
  position: relative;
  height: 270px;
  overflow: hidden;
  background: #110c08;
  touch-action: pan-y;

  @media (min-width: 760px) {
    height: 300px;
  }
`;
const SlideImage = styled.div<{ $src?: string | null }>`
  position: absolute;
  inset: 0;
  background: ${(p) =>
    p.$src
      ? `center / cover no-repeat url(${p.$src})`
      : "radial-gradient(circle at 50% 40%, rgba(255, 255, 255, 0.76) 0 42px, transparent 43px), linear-gradient(135deg, var(--pc-color-gold) 0%, var(--pc-color-primary) 100%)"};

  &::before {
    content: "";
    position: absolute;
    inset: 0;
    background:
      linear-gradient(to top, rgba(8, 5, 3, 0.94) 0%, rgba(8, 5, 3, 0.42) 45%, transparent 72%),
      linear-gradient(to right, rgba(0, 0, 0, 0.24), transparent 58%);
  }
`;
const BadgeFloat = styled.div`
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 4;
`;
const SlideCopy = styled.div`
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: 46px;
  z-index: 3;
  color: #fff;
`;
const SlideMenuName = styled.h3`
  margin: 0;
  max-width: 82%;
  font-size: 23px;
  line-height: 1.08;
  font-weight: 900;
  text-shadow: 0 2px 18px rgba(0, 0, 0, 0.55);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;

  @media (max-width: 759px) {
    font-size: 18px;
    font-weight: 700;
    line-height: 1.12;
  }

  @media (max-width: 360px) {
    font-size: 17px;
  }
`;
const SlidePrice = styled.div`
  margin-top: 7px;
  font-size: 24px;
  line-height: 1;
  font-weight: 900;
  text-shadow: 0 2px 16px rgba(0, 0, 0, 0.55);

  @media (max-width: 759px) {
    margin-top: 6px;
    font-size: 20px;
    font-weight: 700;
  }

  @media (max-width: 360px) {
    font-size: 19px;
  }
`;
const SlideMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
`;
const SlideMetaPill = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 31px;
  padding: 0 10px;
  border-radius: var(--pc-radius-pill);
  background: rgba(16, 11, 8, 0.78);
  border: 1px solid rgba(255, 90, 31, 0.28);
  color: rgba(255, 255, 255, 0.94);
  font-size: 12px;
  font-weight: 800;
  backdrop-filter: blur(10px);

  svg {
    color: var(--pc-color-primary);
    flex: 0 0 auto;
  }
`;
const CarouselNav = styled.button<{ $side: "left" | "right" }>`
  position: absolute;
  top: 50%;
  ${(p) => (p.$side === "left" ? "left: 10px;" : "right: 10px;")}
  z-index: 5;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  transform: translateY(-50%);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  background: rgba(10, 7, 5, 0.72);
  color: #fff;
  cursor: pointer;
  opacity: 0;
  transition: opacity var(--pc-dur) var(--pc-ease), background var(--pc-dur) var(--pc-ease);
  backdrop-filter: blur(10px);

  ${VendorCard}:hover &,
  &:focus-visible {
    opacity: 1;
  }

  &:hover {
    background: rgba(255, 90, 31, 0.9);
  }

  @media (max-width: 759px) {
    display: none;
  }
`;
const CarouselFooter = styled.div`
  position: absolute;
  left: 14px;
  right: 14px;
  bottom: 12px;
  z-index: 4;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
`;
const CarouselDots = styled.div`
  grid-column: 2;
  display: flex;
  align-items: center;
  gap: 7px;
`;
const CarouselDot = styled.button<{ $active: boolean }>`
  width: ${(p) => (p.$active ? "18px" : "7px")};
  height: 7px;
  padding: 0;
  border: 0;
  border-radius: var(--pc-radius-pill);
  background: ${(p) =>
    p.$active ? "var(--pc-color-primary)" : "rgba(255, 255, 255, 0.52)"};
  cursor: pointer;
  transition: width var(--pc-dur) var(--pc-ease), background var(--pc-dur) var(--pc-ease);
`;
const CarouselCount = styled.span`
  grid-column: 3;
  justify-self: end;
  padding: 5px 9px;
  border-radius: var(--pc-radius-pill);
  background: rgba(10, 7, 5, 0.74);
  border: 1px solid rgba(255, 90, 31, 0.24);
  color: rgba(255, 255, 255, 0.9);
  font-size: 11px;
  font-weight: 800;
  backdrop-filter: blur(10px);
`;
const Body = styled(Stack)`
  position: relative;
  padding: 15px 16px 16px;
  flex: 1;
  z-index: 2;
`;
const VendorInfoStrip = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 90, 31, 0.16);
`;
const VendorInfoItem = styled.div`
  min-width: 0;
  padding: 10px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.025);
  color: var(--pc-text);

  small {
    display: block;
    margin-top: 5px;
    color: var(--pc-text-muted);
    font-size: 11px;
    line-height: 1.25;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 759px) {
    padding: 9px 8px;

    small {
      font-size: 10.5px;
    }
  }
`;
const VendorInfoHeading = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;

  svg {
    color: var(--pc-color-primary);
    flex: 0 0 auto;
    font-size: 16px;
  }

  h4 {
    min-width: 0;
    margin: 0;
    color: var(--pc-text);
    font-size: 12.5px;
    font-weight: 700;
    line-height: 1.2;
  }

  @media (max-width: 759px) {
    gap: 5px;

    svg {
      font-size: 15px;
    }

    h4 {
      font-size: 11.5px;
      font-weight: 600;
      line-height: 1.15;
      white-space: nowrap;
    }
  }

  @media (max-width: 360px) {
    h4 {
      font-size: 10.5px;
    }
  }
`;
const ViewKitchenLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 44px;
  width: 100%;
  border-radius: 13px;
  background: linear-gradient(135deg, #ff642b 0%, #ff4c11 100%);
  color: #fff;
  font-size: 14px;
  font-weight: 900;
  box-shadow: 0 12px 28px rgba(255, 90, 31, 0.2);
  transition: transform var(--pc-dur) var(--pc-ease), box-shadow var(--pc-dur) var(--pc-ease);

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 16px 34px rgba(255, 90, 31, 0.28);
  }

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--pc-color-primary-50);
  }
`;
const SearchWrap = styled.div`
  position: relative;
  margin: 0 0 var(--pc-space-3);
`;
const SearchIcon = styled.span`
  position: absolute;
  left: 18px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 1;
  color: var(--pc-text-muted);
  font-size: 23px;
  pointer-events: none;

  @media (max-width: 759px) {
    left: 15px;
    font-size: 20px;
  }
`;
const MarketplaceSearch = styled(Input)`
  height: 58px;
  border-radius: 22px;
  padding-left: 54px;
  background: color-mix(in srgb, var(--pc-surface) 78%, #080604);
  border-color: rgba(255, 90, 31, 0.18);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.035),
    0 10px 30px rgba(0, 0, 0, 0.16);
  font-size: 15px;

  @media (max-width: 759px) {
    height: 50px;
    border-radius: 18px;
    padding-left: 46px;
    font-size: 14.5px;

    &::placeholder {
      font-size: 14.5px;
    }
  }
`;
const CategoryRail = styled.nav`
  margin: 0 0 var(--pc-space-5);
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;
const CategoryTabs = styled.div`
  display: flex;
  gap: 10px;
  min-width: max-content;

  @media (max-width: 759px) {
    gap: 8px;
  }
`;
const CategoryTab = styled.button<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  flex: 0 0 auto;
  min-height: 48px;
  padding: 0 17px;
  border-radius: 13px;
  border: 1px solid
    ${(p) =>
      p.$active ? "var(--pc-color-primary)" : "rgba(255, 90, 31, 0.16)"};
  background: ${(p) =>
    p.$active
      ? "linear-gradient(135deg, #ff642b 0%, #ff4c11 100%)"
      : "color-mix(in srgb, var(--pc-surface) 82%, #070503)"};
  color: ${(p) => (p.$active ? "#fff" : "var(--pc-text)")};
  font: inherit;
  font-size: 14px;
  font-weight: 900;
  cursor: pointer;
  transition:
    background var(--pc-dur) var(--pc-ease),
    border-color var(--pc-dur) var(--pc-ease),
    color var(--pc-dur) var(--pc-ease),
    transform var(--pc-dur) var(--pc-ease);

  &:hover {
    transform: translateY(-1px);
    border-color: var(--pc-color-primary);
  }

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--pc-color-primary-50);
  }

  .category-icon {
    display: inline-grid;
    place-items: center;
    font-size: 20px;
    line-height: 1;
  }

  @media (max-width: 759px) {
    min-height: 38px;
    padding: 0 10px;
    gap: 7px;
    border-radius: 12px;
    font-size: 12px;

    .category-icon {
      font-size: 18px;
    }
  }

  @media (max-width: 360px) {
    min-height: 40px;
    padding: 0 12px;
    font-size: 13px;
  }
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
  background: rgba(0, 0, 0, 0.34);
  border: 1px solid rgba(255, 90, 31, 0.12);
  color: var(--pc-text);
  font-size: 12.5px;
  font-weight: 800;
  padding: 5px 8px;
  white-space: nowrap;

  @media (max-width: 759px) {
    font-size: 14px;
    padding: 5px 8px;
    gap: 4px;
  }

  @media (max-width: 360px) {
    font-size: 12.5px;
    padding: 4px 7px;
  }
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
const MarketplaceSurface = styled(Stack)`
  position: relative;
  isolation: isolate;

  &::before {
    content: "";
    position: fixed;
    inset: 0;
    z-index: -1;
    pointer-events: none;
    background:
      radial-gradient(
        680px 420px at 88% 8%,
        rgba(255, 90, 31, 0.1),
        transparent 66%
      ),
      radial-gradient(
        520px 320px at 12% 22%,
        rgba(244, 180, 0, 0.07),
        transparent 62%
      );
  }
`;
const SectionIntro = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 14px;

  @media (max-width: 759px) {
    gap: 8px;
    margin-bottom: 12px;
  }
`;
const SectionTitle = styled.h2`
  font-size: 22px;
  font-weight: 900;
  color: var(--pc-text);
  letter-spacing: 0;

  @media (max-width: 759px) {
    font-size: 16px;
  }
`;
const LiveDot = styled.span`
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--pc-color-accent);
  box-shadow: 0 0 0 5px rgba(47, 190, 108, 0.11);
`;
const SectionHint = styled.span`
  color: var(--pc-text-muted);
  font-size: 14px;
  font-weight: 700;

  @media (max-width: 759px) {
    font-size: 12px;
    line-height: 1.25;
  }
`;
const VendorIdentity = styled.div`
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: start;

  @media (max-width: 759px) {
    grid-template-columns: 44px minmax(0, 1fr) auto;
    gap: 9px;
  }
`;
const VendorLogo = styled.div<{ $src?: string | null }>`
  width: 46px;
  height: 46px;
  border-radius: 50%;
  border: 2px solid rgba(255, 244, 225, 0.75);
  background: ${(p) =>
    p.$src
      ? `center / cover no-repeat url(${p.$src})`
      : "linear-gradient(135deg, #3b2416, #ff5a1f)"};
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.28);

  @media (max-width: 759px) {
    width: 44px;
    height: 44px;
  }
`;
const VendorName = styled(Title)`
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 18px;
  line-height: 1.08;

  @media (max-width: 759px) {
    font-size: 18px;
  }

  @media (max-width: 360px) {
    font-size: 16px;
    font-weight: 600;
  }

  > span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;
const VerifiedMark = styled.span`
  display: inline-grid;
  place-items: center;
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--pc-color-primary);
  color: #fff;
  font-size: 10px;
  font-weight: 900;
`;
const MenuName = styled.p`
  margin: 4px 0 0;
  color: var(--pc-text-muted);
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  @media (max-width: 759px) {
    font-size: 14px;
  }

  @media (max-width: 360px) {
    font-size: 13px;
  }
`;
const ListGrid = styled.div`
  display: grid;
  gap: 14px;

  @media (min-width: 980px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
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

function menuSummary(total: number): string {
  if (total <= 0) return "No menus available";
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

function listingItems(listing: DailyOrder | undefined): DailyOrder["items"] {
  return listing?.items ?? [];
}

function itemSoldOut(item: DailyOrder["items"][number] | undefined): boolean {
  if (!item) return false;
  if (item.remainingQuantity != null) return item.remainingQuantity <= 0;
  if (item.maxQuantity != null) {
    return (
      (item.orderedQuantity ?? 0) + (item.reservedQuantity ?? 0) >=
      item.maxQuantity
    );
  }
  return false;
}

type MarketplaceMenuSlide = {
  listing: DailyOrder;
  item: DailyOrder["items"][number];
};

function marketplaceMenuSlides(row: MarketplaceVendor): MarketplaceMenuSlide[] {
  return row.listings.flatMap((listing) =>
    listing.items
      .filter((item) => !itemSoldOut(item))
      .map((item) => ({ listing, item })),
  );
}

function itemPrice(item: DailyOrder["items"][number]): string {
  const activeVariantPrices = item.snapshotVariants
    .filter((variant) => variant.isActive !== false)
    .map((variant) => variant.priceKobo);
  if (activeVariantPrices.length === 0) {
    return formatKobo(item.snapshotPriceKobo);
  }
  const min = Math.min(...activeVariantPrices);
  const max = Math.max(...activeVariantPrices);
  return min === max ? formatKobo(min) : `${formatKobo(min)}`;
}

function remainingQuantityLabel(
  item: DailyOrder["items"][number],
): string | null {
  const remaining =
    item.remainingQuantity ??
    (item.maxQuantity != null
      ? Math.max(
          0,
          item.maxQuantity -
            (item.orderedQuantity ?? 0) -
            (item.reservedQuantity ?? 0),
        )
      : null);
  if (remaining == null) return null;
  return `${remaining} left`;
}

function locationLabel(row: MarketplaceVendor, listing?: DailyOrder): string {
  return (
    row.vendor.areaOrAddress ??
    listing?.vendorPickupLocation ??
    listing?.deliveryCoverage ??
    "Campus pickup"
  );
}

function fulfillmentTime(listing?: DailyOrder): string {
  if (!listing) return "Pickup";
  if (listing.pickupAvailable && listing.deliveryAvailable) {
    return "Pickup & delivery";
  }
  if (listing.deliveryAvailable && listing.deliveryEstimateMinutes) {
    return `Delivery ${listing.deliveryEstimateMinutes} min`;
  }
  if (listing.deliveryAvailable) return "Delivery";
  if (listing.pickupAvailable) return "Campus pickup";
  return fulfillmentLabel([listing]);
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
      return coords ? { campus, distance: distanceMeters(here, coords) } : null;
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
  disabled,
}: {
  campuses: Campus[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <CampusPickerWrap>
      <CampusSelect
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Filter marketplace by campus">
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

function CategoryFilter({
  value,
  onChange,
}: {
  value: CategoryFilterValue;
  onChange: (value: CategoryFilterValue) => void;
}) {
  return (
    <CategoryRail aria-label="Filter marketplace by category">
      <CategoryTabs role="list">
        {CATEGORY_TABS.map((tab) => (
          <CategoryTab
            key={tab.value}
            type="button"
            $active={value === tab.value}
            aria-pressed={value === tab.value}
            onClick={() => onChange(tab.value)}>
            <span className="category-icon" aria-hidden>
              {tab.icon}
            </span>
            {tab.label}
          </CategoryTab>
        ))}
      </CategoryTabs>
    </CategoryRail>
  );
}

function filterMarketplaceRows<T extends MarketplaceVendor>(
  rows: T[],
  category: CategoryFilterValue,
): T[] {
  if (category === "ALL") return rows;
  return rows
    .map((row) => {
      const filteredListings = row.listings
        .map((listing) => {
          const itemCategories = listing.items
            .map((item) =>
              item.category ? normalizeMenuCategory(item.category) : null,
            )
            .filter((value): value is MenuCategoryValue => Boolean(value));
          if (itemCategories.length === 0) {
            const vendorCategories = (row.vendor.categories ?? [])
              .map(normalizeMenuCategory)
              .filter(Boolean);
            return vendorCategories.includes(category) ? listing : null;
          }
          const items = listing.items.filter(
            (item) =>
              !!item.category &&
              normalizeMenuCategory(item.category) === category,
          );
          return items.length > 0 ? { ...listing, items } : null;
        })
        .filter((listing): listing is T["listings"][number] =>
          Boolean(listing),
        );
      return filteredListings.length > 0
        ? ({ ...row, listings: filteredListings } as T)
        : null;
    })
    .filter((row): row is T => Boolean(row));
}

export default function MarketplaceWrapper() {
  const { user, isLoading: authLoading, refresh } = useAuth();
  const { toast } = useToast();
  const { data: campuses, isLoading: campusesLoading } = useSWR<Campus[]>(
    "/campuses",
    fetcher,
  );
  const [selectedCampusId, setSelectedCampusId] = useState("");
  const [savingCampusId, setSavingCampusId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] =
    useState<CategoryFilterValue>("ALL");
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
    { refreshInterval: 10_000 },
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
    { refreshInterval: searching ? 10_000 : 0 },
  );

  const campusName = campuses?.find((c) => c.id === selectedCampusId)?.name;
  const activeCampuses = campuses ?? [];
  const vendors = useMemo(
    () => filterMarketplaceRows(data ?? [], selectedCategory),
    [data, selectedCategory],
  );
  const searchHits = useMemo(
    () => filterMarketplaceRows(hits ?? [], selectedCategory),
    [hits, selectedCategory],
  );
  const selectedCategoryLabel =
    CATEGORY_TABS.find((tab) => tab.value === selectedCategory)?.label ??
    "category";

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

  async function saveAccountCampus(campusId: string) {
    if (!user || !campusId || campusId === user.campusId) return;
    setSavingCampusId(campusId);
    try {
      const response = await api.patch("/users/me/campus", { campusId });
      const updatedUser = response.data?.data as PublicUser | undefined;
      if (updatedUser) {
        await globalMutate("/users/me", updatedUser, {
          revalidate: false,
        });
      } else {
        refresh();
      }
      toast("Campus saved to your account.", "success");
    } catch (error) {
      toast(errMsg(error), "error");
    } finally {
      setSavingCampusId(null);
    }
  }

  function handleCampusChange(value: string) {
    manualCampusRef.current = true;
    setLocationNotice("");
    setSelectedCampusId(value);
    void saveAccountCampus(value);
  }

  if (availabilityLoading || authLoading || campusesLoading || isLoading) {
    return (
      <MarketplaceSurface $gap={0}>
        <PageHeader
          eyebrow="Marketplace"
          title="Campus kitchens"
          subtitle="Browse food, prices, ratings and order windows."
          actions={
            <CampusFilter
              campuses={activeCampuses}
              value={selectedCampusId}
              onChange={handleCampusChange}
              disabled={!!savingCampusId}
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
      </MarketplaceSurface>
    );
  }

  if (!marketplaceEnabled || isMarketplaceUnavailable(error)) {
    return (
      <MarketplaceSurface $gap={0}>
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
      </MarketplaceSurface>
    );
  }

  return (
    <MarketplaceSurface $gap={0}>
      <PageHeader
        eyebrow="Marketplace"
        title="Campus kitchens"
        subtitle="Browse verified campus kitchens and fresh meals near you."
        actions={
          <CampusFilter
            campuses={activeCampuses}
            value={selectedCampusId}
            onChange={handleCampusChange}
            disabled={!!savingCampusId}
          />
        }
      />
      {locationNotice && <Notice>{locationNotice}</Notice>}
      {campusName && !locationNotice && (
        <Notice>Showing vendors near {campusName}.</Notice>
      )}

      <SearchWrap>
        <SearchIcon aria-hidden>
          <FiSearch />
        </SearchIcon>
        <MarketplaceSearch
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search meals, snacks, drinks, kitchens..."
          aria-label="Search vendors"
        />
      </SearchWrap>

      <CategoryFilter value={selectedCategory} onChange={setSelectedCategory} />

      {searching ? (
        <SearchResults
          hits={searchHits}
          loading={hitsLoading}
          q={debounced}
          categoryLabel={selectedCategoryLabel}
          categoryFiltered={selectedCategory !== "ALL"}
        />
      ) : vendors.length === 0 ? (
        <EmptyState
          icon={<MarketIllustration />}
          title={
            selectedCategory === "ALL"
              ? "No kitchens found here"
              : `No ${selectedCategoryLabel.toLowerCase()} found here`
          }
          description={
            selectedCategory === "ALL"
              ? "There are no eligible vendors in this location yet."
              : "Try All categories or choose another campus."
          }
        />
      ) : (
        <VendorGrid vendors={vendors} />
      )}
    </MarketplaceSurface>
  );
}

function errMsg(error: unknown): string {
  const err = error as { response?: { data?: { message?: string } } };
  return err?.response?.data?.message ?? "Could not save campus.";
}

function MarketplaceSlideStatus({
  row,
  listing,
}: {
  row: MarketplaceVendor;
  listing: DailyOrder;
}) {
  const status = useVendorStatus({
    isOpenForOrders: row.vendor.isOpenForOrders,
    listings: [listing],
  });
  return <VendorStatusBadge status={status} compact />;
}

/**
 * One vendor per card, with every currently available menu represented as a
 * carousel slide. Menu-specific facts move with the slide; vendor identity,
 * rating, fulfilment and the kitchen link stay fixed.
 */
function VendorGridCard({ row }: { row: MarketplaceVendor }) {
  const slides = useMemo(() => marketplaceMenuSlides(row), [row]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [carouselPaused, setCarouselPaused] = useState(false);
  const [manualPauseUntil, setManualPauseUntil] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const vendorId = row.vendor.id || row.listings[0]?.vendorId;
  const activeSlide = slides[activeIndex] ?? slides[0];
  const fallbackListing = row.listings[0];
  const fallbackItem = fallbackListing?.items[0];
  const menuCount = slides.length;
  const hasMultipleMenus = menuCount > 1;

  useEffect(() => {
    if (activeIndex < menuCount) return;
    setActiveIndex(Math.max(0, menuCount - 1));
  }, [activeIndex, menuCount]);

  useEffect(() => {
    if (!hasMultipleMenus || carouselPaused) return;

    const reducedMotionQuery = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    if (reducedMotionQuery.matches) return;

    const intervalId = window.setInterval(() => {
      if (document.hidden || Date.now() < manualPauseUntil) return;
      setActiveIndex((current) => (current + 1) % menuCount);
    }, 6_000);

    return () => window.clearInterval(intervalId);
  }, [carouselPaused, hasMultipleMenus, manualPauseUntil, menuCount]);

  function pauseAfterManualInteraction() {
    setManualPauseUntil(Date.now() + 10_000);
  }

  function showPrevious() {
    if (!hasMultipleMenus) return;
    pauseAfterManualInteraction();
    setActiveIndex((current) => (current - 1 + menuCount) % menuCount);
  }

  function showNext() {
    if (!hasMultipleMenus) return;
    pauseAfterManualInteraction();
    setActiveIndex((current) => (current + 1) % menuCount);
  }

  function handleTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    setCarouselPaused(true);
    pauseAfterManualInteraction();
    touchStartX.current = event.touches[0]?.clientX ?? null;
  }

  function handleTouchEnd(event: React.TouchEvent<HTMLDivElement>) {
    setCarouselPaused(false);
    const startX = touchStartX.current;
    const endX = event.changedTouches[0]?.clientX;
    touchStartX.current = null;
    if (startX == null || endX == null) return;
    const distance = endX - startX;
    if (Math.abs(distance) < 42) return;
    if (distance > 0) showPrevious();
    else showNext();
  }

  const selectedListing = activeSlide?.listing ?? fallbackListing;
  const selectedItem = activeSlide?.item ?? fallbackItem;
  const totalReviews = row.vendor.totalReviews ?? 0;

  return (
    <VendorCard>
      <Media
        onMouseEnter={() => setCarouselPaused(true)}
        onMouseLeave={() => setCarouselPaused(false)}
        onFocusCapture={() => setCarouselPaused(true)}
        onBlurCapture={() => setCarouselPaused(false)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        aria-roledescription={hasMultipleMenus ? "carousel" : undefined}
        aria-label={`${row.vendor.businessName ?? "Campus kitchen"} menus`}>
        <SlideImage
          $src={selectedItem?.snapshotImageUrl ?? row.vendor.profileImageUrl}
          role="img"
          aria-label={
            selectedItem?.snapshotImageUrl
              ? selectedItem.snapshotName
              : `${selectedItem?.snapshotName ?? row.vendor.businessName ?? "Kitchen"} image placeholder`
          }
        />

        {selectedListing && (
          <BadgeFloat>
            <MarketplaceSlideStatus row={row} listing={selectedListing} />
          </BadgeFloat>
        )}

        {selectedItem && (
          <SlideCopy aria-live="polite">
            <SlideMenuName>{selectedItem.snapshotName}</SlideMenuName>
            <SlidePrice>{itemPrice(selectedItem)}</SlidePrice>
            <SlideMeta>
              {selectedItem.snapshotPrepMin != null && (
                <SlideMetaPill>
                  <FiClock aria-hidden />
                  Ready in {selectedItem.snapshotPrepMin} min
                </SlideMetaPill>
              )}
              {remainingQuantityLabel(selectedItem) && (
                <SlideMetaPill>
                  <FiShoppingBag aria-hidden />
                  {remainingQuantityLabel(selectedItem)}
                </SlideMetaPill>
              )}
            </SlideMeta>
          </SlideCopy>
        )}

        {hasMultipleMenus && (
          <>
            <CarouselNav
              type="button"
              $side="left"
              onClick={showPrevious}
              aria-label="Show previous menu">
              <FiChevronLeft aria-hidden />
            </CarouselNav>
            <CarouselNav
              type="button"
              $side="right"
              onClick={showNext}
              aria-label="Show next menu">
              <FiChevronRight aria-hidden />
            </CarouselNav>
            <CarouselFooter>
              <CarouselDots aria-label="Choose menu slide">
                {slides.map((slide, index) => (
                  <CarouselDot
                    key={`${slide.listing.id}-${slide.item.id}`}
                    type="button"
                    $active={index === activeIndex}
                    onClick={() => {
                      pauseAfterManualInteraction();
                      setActiveIndex(index);
                    }}
                    aria-label={`Show menu ${index + 1}: ${slide.item.snapshotName}`}
                    aria-current={index === activeIndex ? "true" : undefined}
                  />
                ))}
              </CarouselDots>
              <CarouselCount>
                {activeIndex + 1} of {menuCount}
              </CarouselCount>
            </CarouselFooter>
          </>
        )}
      </Media>

      <Body $gap={13}>
        <VendorIdentity>
          <VendorLogo
            $src={row.vendor.profileImageUrl ?? selectedItem?.snapshotImageUrl}
            aria-hidden
          />
          <div>
            <VendorName>
              <span>{row.vendor.businessName ?? "Campus kitchen"}</span>
              <VerifiedMark aria-label="Verified kitchen">
                <FiCheckCircle aria-hidden />
              </VerifiedMark>
            </VendorName>
            <MenuName>{menuSummary(menuCount)}</MenuName>
          </div>
          {totalReviews > 0 ? (
            <RatingPill
              aria-label={`Rated ${ratingText(row.vendor.rating)} out of 5 from ${totalReviews} reviews`}>
              <RatingStar aria-hidden>
                <FiStar />
              </RatingStar>
              {ratingText(row.vendor.rating)}
              <RatingCount aria-hidden>({totalReviews})</RatingCount>
            </RatingPill>
          ) : (
            <RatingPill aria-label="New vendor with no ratings yet">
              New vendor
            </RatingPill>
          )}
        </VendorIdentity>

        <VendorInfoStrip>
          <VendorInfoItem>
            <VendorInfoHeading>
              {selectedListing?.deliveryAvailable ? (
                <FiTruck aria-hidden />
              ) : (
                <FiShoppingBag aria-hidden />
              )}
              <h4>{fulfillmentTime(selectedListing)}</h4>
            </VendorInfoHeading>
            <small>{locationLabel(row, selectedListing)}</small>
          </VendorInfoItem>
          <VendorInfoItem>
            <VendorInfoHeading>
              <FiGrid aria-hidden />
              <h4>{menuSummary(menuCount)}</h4>
            </VendorInfoHeading>
            <small>Swipe to explore</small>
          </VendorInfoItem>
        </VendorInfoStrip>

        <ViewKitchenLink href={vendorId ? `/v/${vendorId}` : "/marketplace"}>
          View kitchen
          <FiChevronRight aria-hidden />
        </ViewKitchenLink>
      </Body>
    </VendorCard>
  );
}

function VendorGrid({ vendors }: { vendors: MarketplaceVendor[] }) {
  return (
    <Stack $gap={0}>
      <SectionIntro>
        <SectionTitle>Available now</SectionTitle>
        <LiveDot aria-hidden />
        <SectionHint>Live orders from top kitchens</SectionHint>
      </SectionIntro>
      <ListGrid>
        {vendors.map((row, i) => (
          <FadeIn key={row.vendor.id} $delay={i * 45}>
            <VendorGridCard row={row} />
          </FadeIn>
        ))}
      </ListGrid>
    </Stack>
  );
}

function SearchResults({
  hits,
  loading,
  q,
  categoryLabel,
  categoryFiltered,
}: {
  hits?: VendorSearchHit[];
  loading: boolean;
  q: string;
  categoryLabel: string;
  categoryFiltered: boolean;
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
        title={
          categoryFiltered
            ? `No ${categoryLabel.toLowerCase()} matches for "${q}"`
            : `No matches for "${q}"`
        }
        description={
          categoryFiltered
            ? "Try All categories or another search."
            : "Try another shop name, dish or listing."
        }
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