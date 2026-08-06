"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import styled, { keyframes } from "styled-components";
import useSWR from "swr";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FadeIn,
  Input,
  PageHeader,
  Row,
  SectionHeader,
  Skeleton,
  Stack,
  StatCard,
  Text,
  Title,
} from "@/components";
import { PageLoader } from "@/components/Loader";
import { api, apiData } from "@/constants/api";
import { fetcher } from "@/constants/fetcher";
import {
  formatDate,
  formatKobo,
  statusLabel,
  timeUntil,
} from "@/constants/formatters";
import { useToast } from "@/hooks/useToast";
import VendorOnboardingWrapper, {
  type VendorMe,
} from "@/libs/VendorOnboardingWrapper";
import type { DailyOrder, OrderStatus } from "@/types";

interface IncomingOrder {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  fulfillmentType: "PICKUP" | "DELIVERY";
  totalKobo: number;
  createdAt?: string;
  items: Array<{ snapshotName: string; quantity: number }>;
}

interface VendorAnalyticsLifetime {
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  totalRevenueKobo: number;
  totalFoodSubtotalKobo: number;
  totalCommissionKobo: number;
  totalDeliveryEarningsKobo: number;
  totalVendorSettlementKobo: number;
  avgOrderValueKobo: number;
  rating: number;
  totalReviews: number;
  completionRate: number;
}

interface VendorAnalytics {
  lifetime: VendorAnalyticsLifetime;
}

const OpenCard = styled(Card)`
  display: flex;
  align-items: center;
  gap: var(--pc-space-4);
  background: var(--pc-gradient-calm-orange);
  border: 1px solid var(--pc-vendor-border);
  border-left: 3px solid var(--pc-color-primary);
  lor: var(--pc-text-inverse);
  box-shadow: none;
  padding: var(--pc-space-4) var(--pc-space-5);
  margin-bottom: var(--pc-space-3);
`;
const CompactStatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  width: 100%;

  @media (max-width: 340px) {
    grid-template-columns: repeat(auto-fit, minmax(104px, 1fr));
  }

  > div {
    min-width: 0;
    padding: 12px 10px;
    gap: 6px;
  }

  > div > div:first-child {
    min-width: 0;
    gap: 6px;
  }

  > div > div:first-child > span:first-child {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11.5px;
    font-weight: 800;
    line-height: 1.15;
  }

  > div > div:first-child > span:last-child {
    flex: 0 0 auto;
    font-size: 15px;
  }

  > div > div:nth-child(2) {
    min-width: 0;
    overflow-wrap: anywhere;
    font-size: 20px;
    font-weight: 900;
    letter-spacing: 0;
    line-height: 1.05;
  }

  > div > span {
    font-size: 11.5px;
    line-height: 1.15;
  }

  @media (min-width: 390px) {
    > div > div:nth-child(2) {
      font-size: 22px;
    }
  }
`;
const OpenText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 0;
`;
const OpenTitle = styled.span`
  font-family: var(--pc-font-display);
  font-size: 15px;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: var(--pc-text);
`;
const OpenSub = styled.span`
  font-size: 12.5px;
  font-weight: 600;
  color: var(--pc-text-muted);
`;
const NewButton = styled(Link)`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  padding: 14px;
  border-radius: var(--pc-radius);
  background: var(--pc-gradient-calm-orange);
  color: var(--pc-text-inverse);
  font-family: var(--pc-font-display);
  font-weight: 800;
  font-size: 15px;
  letter-spacing: -0.01em;
  box-shadow: var(--pc-shadow-calm-orange);
  transition:
    transform var(--pc-dur) var(--pc-ease),
    background var(--pc-dur) var(--pc-ease);
  &:hover {
    transform: translateY(-2px);
  }
  margin-bottom: var(--pc-space-4);
`;
const OrderCard = styled(Card)`
  display: block;
  color: inherit;
  &:hover {
    box-shadow: var(--pc-shadow-lg);
    transform: translateY(-3px);
    border-color: var(--pc-surface-3);
  }
`;
const CookLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--pc-color-primary);
  font-weight: 800;
  font-size: 14px;
`;
const EditLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--pc-text-muted);
  font-weight: 700;
  font-size: 13.5px;
  &:hover {
    color: var(--pc-text);
  }
`;
const TitleLink = styled(Link)`
  color: inherit;
  display: inline-block;
  &:hover {
    color: var(--pc-color-primary);
  }
`;
const IncomingItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 11px 0;
  border-bottom: 1px solid var(--pc-border);
  &:last-child {
    border-bottom: none;
  }
`;
const pulse = keyframes`
	0%, 100% { opacity: 1; transform: scale(1); }
	50% { opacity: 0.4; transform: scale(0.7); }
`;
const CompactCountBubble = styled.span`
  position: absolute;
  top: -4px;
  right: -6px;
  min-width: 14px;
  height: 14px;
  padding: 0 4px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--pc-color-primary);
  color: #fff;
  font-size: 8px;
  font-weight: 900;
  line-height: 1;
  box-shadow: 0 0 0 2px var(--pc-vendor-surface);
`;
const LivePulse = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--pc-color-accent);
  &::before {
    content: "";
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: var(--pc-color-accent);
    animation: ${pulse} 1.6s ease-in-out infinite;
  }
`;
const Toggle = styled.button<{ $on: boolean }>`
  position: relative;
  width: 56px;
  height: 32px;
  border-radius: 999px;
  border: 2px solid rgba(255, 255, 255, 0.55);
  cursor: pointer;
  flex-shrink: 0;
  background: ${(p) =>
    p.$on ? "rgba(255, 255, 255, 0.92)" : "rgba(0, 0, 0, 0.18)"};
  transition: background var(--pc-dur) var(--pc-ease);
  &::after {
    content: "";
    position: absolute;
    top: 3px;
    left: ${(p) => (p.$on ? "27px" : "3px")};
    width: 22px;
    height: 22px;
    border-radius: 999px;
    background: ${(p) => (p.$on ? "var(--pc-color-accent)" : "#fff")};
    box-shadow: var(--pc-shadow);
    transition:
      left var(--pc-dur) var(--pc-ease),
      background var(--pc-dur) var(--pc-ease);
  }
`;
const ModalBackdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  padding: 18px;
  background: rgba(17, 24, 39, 0.58);
  backdrop-filter: blur(6px);
`;
const SecurityModal = styled.div`
  width: min(100%, 460px);
  max-height: calc(100vh - 36px);
  overflow: auto;
  border-radius: var(--pc-radius);
  background: var(--pc-surface);
  border: 1px solid var(--pc-border);
  box-shadow: var(--pc-shadow-lg);
  padding: 22px;
`;
const SecurityMark = styled.div`
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  border-radius: var(--pc-radius-sm);
  background: var(--pc-color-primary-50);
  color: var(--pc-color-primary-ink);
  font-size: 23px;
  font-weight: 900;
`;
const SecurityList = styled.ul`
  margin: 0;
  padding-left: 18px;
  color: var(--pc-text-muted);
  font-size: 14px;
  line-height: 1.55;
`;

const FilterChips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;
const Chip = styled.button<{ $on: boolean }>`
  padding: 7px 13px;
  border-radius: var(--pc-radius-pill);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all var(--pc-dur) var(--pc-ease);
  border: 1.5px solid
    ${(p) => (p.$on ? "var(--pc-color-primary)" : "var(--pc-border)")};
  background: ${(p) =>
    p.$on ? "var(--pc-color-primary)" : "var(--pc-surface)"};
  color: ${(p) => (p.$on ? "var(--pc-text-inverse)" : "var(--pc-text-muted)")};
  &:hover {
    border-color: var(--pc-color-primary);
  }
`;
const DateRange = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;

  @media (min-width: 600px) {
    grid-template-columns: 1fr 1fr;
  }
`;

const DashboardShell = styled.div`
  background: var(--pc-vendor-bg);
  min-height: 100%;
`;
const HeroSection = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--pc-space-4);
  padding: var(--pc-space-5) var(--pc-space-5) var(--pc-space-4);
  background: var(--pc-vendor-surface);
  border: 1px solid var(--pc-vendor-border);
  border-radius: var(--pc-radius);
  margin-bottom: var(--pc-space-3);
`;
const HeroText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
`;
const HeroEyebrow = styled.span`
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--pc-color-primary);
`;
const HeroNameRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
`;
const HeroName = styled.h1`
  font-family: var(--pc-font-display);
  font-size: clamp(26px, 5vw, 32px);
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--pc-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;
const VerifiedMark = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--pc-color-accent-50);
  color: var(--pc-color-accent);
  font-size: 12px;
  font-weight: 900;
  flex-shrink: 0;
`;
const HeroSub = styled.p`
  margin: 0;
  font-size: 13.5px;
  color: var(--pc-text-muted);
  line-height: 1.4;
`;
const HeroImage = styled.div`
  width: 56px;
  height: 56px;
  border-radius: var(--pc-radius-sm);
  background: var(--pc-gradient-warm);
  flex-shrink: 0;
  display: grid;
  place-items: center;
  font-size: 26px;
  box-shadow: var(--pc-shadow-primary);
`;
const OpenIcon = styled.span`
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: var(--pc-radius-sm);
  background: var(--pc-color-primary-50);
  font-size: 18px;
  flex-shrink: 0;
`;
const OpenTextCol = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 0;
`;
const OpenTitleSm = styled.span`
  font-family: var(--pc-font-display);
  font-size: 15px;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: var(--pc-text);
`;
const OpenSubSm = styled.span`
  font-size: 12.5px;
  font-weight: 600;
  color: var(--pc-text-muted);
`;
const QuickActionsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: var(--pc-space-4);
  @media (max-width: 380px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
`;
const QuickActionLink = styled(Link)`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: var(--pc-space-3) var(--pc-space-2);
  background: var(--pc-vendor-surface);
  border: 1px solid var(--pc-vendor-border);
  border-radius: var(--pc-radius);
  color: var(--pc-text);
  font-size: 12px;
  font-weight: 700;
  transition:
    border-color var(--pc-dur) var(--pc-ease),
    background var(--pc-dur) var(--pc-ease);
  &:hover {
    border-color: var(--pc-color-primary);
    background: var(--pc-vendor-surface-2);
  }
`;
const QuickIcon = styled.span`
  position: relative;
  display: inline-flex;
  font-size: 20px;
  line-height: 1;
`;
const SectionCard = styled(Card)`
  background: var(--pc-vendor-surface);
  border: 1px solid var(--pc-vendor-border);
  margin-bottom: var(--pc-space-3);
`;
const OrdersHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--pc-space-3);
  margin-bottom: var(--pc-space-3);
`;
const OrdersTitle = styled.h2`
  font-family: var(--pc-font-display);
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--pc-text);
  display: flex;
  align-items: center;
  gap: 8px;
`;
const ViewAllLink = styled(Link)`
  font-size: 13px;
  font-weight: 700;
  color: var(--pc-color-primary);
  display: inline-flex;
  align-items: center;
  gap: 4px;
`;
const IncomingSection = styled(SectionCard)`
  margin-bottom: var(--pc-space-3);
`;
const IncomingHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--pc-space-2);
`;
const IncomingTitle = styled.h2`
  font-family: var(--pc-font-display);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--pc-text);
  display: flex;
  align-items: center;
  gap: 8px;
`;
const IncomingRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--pc-space-3);
  padding: 10px 0;
  border-bottom: 1px solid var(--pc-vendor-border);
  &:last-child {
    border-bottom: none;
  }
`;
const IncomingLeft = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  flex: 1;
`;
const IncomingRight = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
  flex-shrink: 0;
`;
const IncomingAmount = styled.span`
  font-family: var(--pc-font-display);
  font-size: 14px;
  font-weight: 800;
  color: var(--pc-text);
`;
const IncomingMeta = styled.span`
  font-size: 11.5px;
  color: var(--pc-text-muted);
  font-weight: 600;
`;
const OrderRowWrap = styled(Link)`
  display: flex;
  align-items: center;
  gap: var(--pc-space-3);
  padding: var(--pc-space-3) var(--pc-space-4);
  background: var(--pc-vendor-surface);
  border: 1px solid var(--pc-vendor-border);
  border-radius: var(--pc-radius);
  color: inherit;
  text-decoration: none;
  transition: border-color var(--pc-dur) var(--pc-ease);
  &:hover {
    border-color: var(--pc-color-primary);
  }
`;
const OrderThumb = styled.div`
  width: 40px;
  height: 40px;
  border-radius: var(--pc-radius-sm);
  background: var(--pc-vendor-surface-2);
  flex-shrink: 0;
  display: grid;
  place-items: center;
  font-size: 18px;
  overflow: hidden;
`;
const OrderThumbImg = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
`;
const OrderBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 0;
`;
const OrderTopRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--pc-space-3);
`;
const OrderTitle = styled.span`
  font-weight: 700;
  font-size: 13.5px;
  color: var(--pc-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;
const OrderMeta = styled.span`
  font-size: 11.5px;
  color: var(--pc-text-muted);
  font-weight: 600;
`;
const OrderStatusPill = styled(Badge)`
  flex-shrink: 0;
`;
const OrderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
`;
const OrderActionLink = styled(Link)`
  font-size: 12px;
  font-weight: 700;
  color: var(--pc-text-muted);
  display: inline-flex;
  align-items: center;
  gap: 3px;
  white-space: nowrap;
  &:hover {
    color: var(--pc-text);
  }
`;
const OrderCloseBtn = styled.button`
  font-size: 12px;
  font-weight: 700;
  color: var(--pc-text-muted);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  white-space: nowrap;
  &:hover {
    color: var(--pc-text);
  }
`;
const OrderChevron = styled.span`
  font-size: 16px;
  color: var(--pc-text-muted);
  flex-shrink: 0;
`;
const CompactStatGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  width: 100%;
  margin-bottom: var(--pc-space-3);
  @media (max-width: 340px) {
    grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
  }
`;
const CompactStatCard = styled(Card)`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 10px;
  background: var(--pc-vendor-surface);
  border: 1px solid var(--pc-vendor-border);
  box-shadow: none;
`;
const CompactStatTop = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
`;
const CompactStatLabel = styled.span`
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--pc-text-muted);
`;
const CompactStatIcon = styled.span`
  font-size: 15px;
  line-height: 1;
`;
const CompactStatValue = styled.div`
  font-family: var(--pc-font-display);
  font-size: 20px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--pc-text);
  line-height: 1.1;
`;
const CompactStatHint = styled.span`
  font-size: 11px;
  font-weight: 600;
  color: var(--pc-text-faint);
`;

const STATUS_FILTERS: Array<{
  label: string;
  value: "" | DailyOrder["status"];
}> = [
  { label: "All", value: "" },
  { label: "Draft", value: "DRAFT" },
  { label: "Active", value: "ACTIVE" },
  { label: "Closed", value: "CLOSED" },
  { label: "Cancelled", value: "CANCELLED" },
];

const SECURITY_ONBOARDING_STORAGE_PREFIX =
  "prechop:vendor-security-onboarding:";

function statusTone(
  s: DailyOrder["status"],
): "primary" | "success" | "warning" | "danger" | "muted" {
  switch (s) {
    case "ACTIVE":
      return "success";
    case "DRAFT":
      return "warning";
    case "CANCELLED":
      return "danger";
    default:
      return "muted";
  }
}

function orderTone(
  s: OrderStatus,
): "primary" | "success" | "warning" | "danger" | "muted" {
  switch (s) {
    case "PAID":
      return "warning";
    case "READY":
    case "COMPLETED":
      return "success";
    case "CANCELLED":
    case "REFUNDED":
      return "danger";
    default:
      return "primary";
  }
}

function errMsg(e: unknown): string {
  const m = (e as { response?: { data?: { message?: string } } })?.response
    ?.data?.message;
  return m ?? "Something went wrong. Please try again.";
}

export default function VendorDashboardWrapper() {
  const { toast } = useToast();
  const {
    data: vendor,
    isLoading,
    mutate: mutateVendor,
  } = useSWR<VendorMe>("/vendors/me", fetcher);

  // Approved vendors see the live dashboard; the onboarding wrapper is only for
  // not-yet-approved statuses. Gate on status alone (matching the server's
  // `assertActiveVendor`) — completeness is a marketplace metric, not an
  // access gate, and requiring it here would strand a just-approved vendor on
  // the onboarding screen with no way to add menu items.
  const isActive = vendor?.status === "ACTIVE";

  // Unfiltered fetch backs the stat cards + the "current active order" incoming
  // panel, so those summaries stay stable regardless of the list filter below.
  const {
    data: orders,
    isLoading: ordersLoading,
    mutate: mutateOrders,
  } = useSWR<DailyOrder[]>(
    isActive ? "/daily-orders/my-orders?limit=50" : null,
    fetcher,
    // Poll so newly-placed/paid orders and counts stay live (#17).
    { refreshInterval: 15_000 },
  );

  // List filter state. Status/date filter server-side; the search box is
  // debounced so typing doesn't fire a request per keystroke.
  const [statusFilter, setStatusFilter] = useState<"" | DailyOrder["status"]>(
    "",
  );
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const hasFilters = !!(statusFilter || debouncedSearch || fromDate || toDate);
  const filterQuery = useMemo(() => {
    const p = new URLSearchParams({ limit: "50" });
    if (statusFilter) p.set("status", statusFilter);
    if (debouncedSearch) p.set("q", debouncedSearch);
    if (fromDate) p.set("from", new Date(fromDate).toISOString());
    // Inclusive of the whole `to` day.
    if (toDate) p.set("to", new Date(`${toDate}T23:59:59.999`).toISOString());
    return p.toString();
  }, [statusFilter, debouncedSearch, fromDate, toDate]);

  // Only hit the server for a filtered set when a filter is actually active;
  // otherwise reuse the unfiltered `orders` above.
  const {
    data: filtered,
    isLoading: filteredLoading,
    mutate: mutateFiltered,
  } = useSWR<DailyOrder[]>(
    isActive && hasFilters ? `/daily-orders/my-orders?${filterQuery}` : null,
    fetcher,
    { refreshInterval: 15_000 },
  );

  // Live incoming buyer orders that still need vendor attention, across every
  // paid payment path and daily order.
  const { data: incoming, mutate: mutateIncoming } = useSWR<IncomingOrder[]>(
    isActive ? "/vendor/orders/incoming" : null,
    fetcher,
    { refreshInterval: 5_000 },
  );

  const { data: analytics } = useSWR<VendorAnalytics>(
    isActive ? "/api/vendor/analytics" : null,
    fetcher,
    { refreshInterval: 60_000, shouldRetryOnError: false },
  );

  const { data: alertData } = useSWR<{ unread?: number }>(
    "/notifications?limit=50",
    fetcher,
    { refreshInterval: 15_000, shouldRetryOnError: false },
  );
  const alertCount = alertData?.unread ?? 0;

  function compactCount(count: number) {
    return count >= 10 ? "9+" : String(count);
  }

  const [toggling, setToggling] = useState(false);
  const [securityBusy, setSecurityBusy] = useState<
    "dismiss" | "complete" | null
  >(null);
  const [securityOnboardingResolved, setSecurityOnboardingResolved] =
    useState(false);
  const [securityStep, setSecurityStep] = useState<"welcome" | "pin">(
    "welcome",
  );
  const [securityPin, setSecurityPin] = useState("");
  const [securityPinConfirm, setSecurityPinConfirm] = useState("");

  useEffect(() => {
    if (!vendor?.id) {
      setSecurityOnboardingResolved(false);
      return;
    }
    const serverResolved =
      !!vendor.securityOnboardingDismissedAt ||
      !!vendor.securityOnboardingCompletedAt;
    if (serverResolved) {
      setSecurityOnboardingResolved(true);
      return;
    }
    try {
      setSecurityOnboardingResolved(
        window.localStorage.getItem(
          `${SECURITY_ONBOARDING_STORAGE_PREFIX}${vendor.id}`,
        ) === "resolved",
      );
    } catch {
      setSecurityOnboardingResolved(false);
    }
  }, [
    vendor?.id,
    vendor?.securityOnboardingDismissedAt,
    vendor?.securityOnboardingCompletedAt,
  ]);

  function clearFilters() {
    setStatusFilter("");
    setSearch("");
    setDebouncedSearch("");
    setFromDate("");
    setToDate("");
  }

  if (isLoading || !vendor) return <PageLoader />;

  if (!isActive) {
    return (
      <VendorOnboardingWrapper
        vendor={vendor}
        onChanged={() => mutateVendor()}
      />
    );
  }

  async function toggleOpen() {
    if (!vendor) return;
    setToggling(true);
    try {
      await api.patch("/vendors/me/open-status", {
        isOpenForOrders: !vendor.isOpenForOrders,
      });
      await mutateVendor();
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setToggling(false);
    }
  }

  async function updateSecurityOnboarding(action: "DISMISS" | "COMPLETE") {
    if (!vendor) return;
    if (action === "COMPLETE") {
      if (!/^\d{4,6}$/.test(securityPin.trim())) {
        toast("Enter a 4-6 digit security PIN", "error");
        return;
      }
      if (securityPin.trim() !== securityPinConfirm.trim()) {
        toast("Security PINs do not match", "error");
        return;
      }
    }
    setSecurityBusy(action === "COMPLETE" ? "complete" : "dismiss");
    const now = new Date().toISOString();
    if (action === "DISMISS") {
      setSecurityOnboardingResolved(true);
      try {
        window.localStorage.setItem(
          `${SECURITY_ONBOARDING_STORAGE_PREFIX}${vendor.id}`,
          "resolved",
        );
      } catch {}
      await mutateVendor(
        { ...vendor, securityOnboardingDismissedAt: now },
        false,
      );
    }
    try {
      const updated = await apiData<VendorMe>(
        api.patch("/vendors/me", {
          action,
          ...(action === "COMPLETE" ? { pin: securityPin.trim() } : {}),
        }),
      );
      if (action === "COMPLETE") {
        setSecurityOnboardingResolved(true);
        try {
          window.localStorage.setItem(
            `${SECURITY_ONBOARDING_STORAGE_PREFIX}${vendor.id}`,
            "resolved",
          );
        } catch {}
      }
      await mutateVendor(updated, false);
      toast(
        action === "COMPLETE"
          ? "Security verification completed"
          : "Security setup saved for later",
        "success",
      );
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setSecurityBusy(null);
    }
  }

  async function closeListing(order: DailyOrder) {
    const reason =
      (order.totalOrdersCount ?? 0) > 0
        ? window.prompt("Enter the cancellation reason buyers should receive:")
        : "";
    if ((order.totalOrdersCount ?? 0) > 0 && !reason?.trim()) return;
    try {
      await api.patch(`/daily-orders/${order.id}/close`, {
        ...(reason?.trim() ? { reason: reason.trim() } : {}),
      });
      toast("Daily order closed", "success");
      await Promise.all([mutateOrders(), mutateFiltered(), mutateIncoming()]);
    } catch (e) {
      toast(errMsg(e), "error");
    }
  }

  // Stats summarise the whole kitchen (unfiltered); the list below reflects the
  // active filter.
  const statList = orders ?? [];
  const activeCount = statList.filter((o) => o.status === "ACTIVE").length;
  const ordersPlaced = statList.reduce(
    (sum, o) => sum + (o.totalOrdersCount ?? 0),
    0,
  );
  const list = hasFilters ? (filtered ?? []) : statList;
  const listLoading = hasFilters ? filteredLoading : ordersLoading;
  const showSecurityModal =
    vendor.status === "ACTIVE" &&
    !securityOnboardingResolved &&
    !vendor.securityOnboardingDismissedAt &&
    !vendor.securityOnboardingCompletedAt;

  return (
    <FadeIn>
      {showSecurityModal && (
        <ModalBackdrop role="presentation">
          <SecurityModal
            role="dialog"
            aria-modal="true"
            aria-labelledby="vendor-security-title">
            <Stack $gap={16}>
              <SecurityMark aria-hidden>!</SecurityMark>
              {securityStep === "welcome" ? (
                <>
                  <Stack $gap={8}>
                    <Title id="vendor-security-title" $size={23}>
                      Welcome to Selling on Prechop
                    </Title>
                    <Text $muted>
                      Before you handle paid orders, set up vendor security
                      verification. It protects your orders, earnings, customer
                      information, and payout settings.
                    </Text>
                  </Stack>
                  <SecurityList>
                    <li>Protect payout changes and bank details.</li>
                    <li>Keep customer and order information safer.</li>
                    <li>Reduce the risk of unauthorized account changes.</li>
                  </SecurityList>
                  <Row $gap={10} $wrap>
                    <Button
                      disabled={!!securityBusy}
                      onClick={() => setSecurityStep("pin")}>
                      Secure my account
                    </Button>
                    <Button
                      $variant="secondary"
                      $loading={securityBusy === "dismiss"}
                      disabled={!!securityBusy}
                      onClick={() => updateSecurityOnboarding("DISMISS")}>
                      Do this later
                    </Button>
                  </Row>
                </>
              ) : (
                <>
                  <Stack $gap={8}>
                    <Title id="vendor-security-title" $size={23}>
                      Create your security PIN
                    </Title>
                    <Text $muted>
                      Use a 4-6 digit PIN. You will need this before sensitive
                      vendor actions such as changing payout details.
                    </Text>
                  </Stack>
                  <Input
                    label="Security PIN"
                    type="password"
                    inputMode="numeric"
                    value={securityPin}
                    onChange={(e) => setSecurityPin(e.target.value)}
                    placeholder="4-6 digits"
                  />
                  <Input
                    label="Confirm PIN"
                    type="password"
                    inputMode="numeric"
                    value={securityPinConfirm}
                    onChange={(e) => setSecurityPinConfirm(e.target.value)}
                    placeholder="Re-enter PIN"
                  />
                  <Row $gap={10} $wrap>
                    <Button
                      $loading={securityBusy === "complete"}
                      disabled={!!securityBusy}
                      onClick={() => updateSecurityOnboarding("COMPLETE")}>
                      Save security PIN
                    </Button>
                    <Button
                      $variant="secondary"
                      disabled={!!securityBusy}
                      onClick={() => setSecurityStep("welcome")}>
                      Back
                    </Button>
                  </Row>
                </>
              )}
            </Stack>
          </SecurityModal>
        </ModalBackdrop>
      )}
      <DashboardShell>
        <Stack $gap={14}>
          <HeroSection>
            <HeroText>
              <HeroEyebrow>Vendor dashboard</HeroEyebrow>
              <HeroNameRow>
                <HeroName>{vendor.businessName ?? "Your kitchen"}</HeroName>
                {vendor.status === "ACTIVE" && (
                  <VerifiedMark aria-label="Verified">✓</VerifiedMark>
                )}
              </HeroNameRow>
              <HeroSub>
                {vendor.isOpenForOrders
                  ? "You're open — buyers can order from you right now."
                  : "You're currently closed for new orders."}
              </HeroSub>
            </HeroText>
          </HeroSection>

          <OpenCard>
            <OpenIcon aria-hidden>🏪</OpenIcon>
            <OpenTextCol>
              <OpenTitleSm>
                {vendor.isOpenForOrders ? "Open for orders" : "Closed"}
              </OpenTitleSm>
              <OpenSubSm>
                {vendor.isOpenForOrders
                  ? "Your store is visible to buyers."
                  : "Your store is hidden from new buyers."}
              </OpenSubSm>
            </OpenTextCol>
            <Toggle
              type="button"
              role="switch"
              aria-checked={vendor.isOpenForOrders}
              $on={vendor.isOpenForOrders}
              onClick={toggleOpen}
              disabled={toggling}
              aria-label="Toggle open for orders"
            />
          </OpenCard>

          <SectionHeader title="Dashboard overview" />
          <CompactStatsGrid>
            <StatCard
              label="Menus"
              value={statList.length}
              icon="🍲"
              hint="Posted this period"
            />
            <StatCard
              label="Live"
              value={activeCount}
              icon="🔥"
              tone="var(--pc-color-accent)"
              hint="Active daily orders"
            />
            <StatCard
              label="Orders"
              value={ordersPlaced}
              icon="🧾"
              tone="var(--pc-color-gold)"
              hint="Across all your posts"
            />
          </CompactStatsGrid>

          <NewButton href="/dashboard/new">
            <span aria-hidden>＋</span> New daily order
          </NewButton>

          <SectionHeader title="Quick actions" />
          <QuickActionsGrid>
            <QuickActionLink href="/menu">
              <QuickIcon aria-hidden>📋</QuickIcon>
              Menu
            </QuickActionLink>
            <QuickActionLink href="/timetable">
              <QuickIcon aria-hidden>🗓️</QuickIcon>
              Timetable
            </QuickActionLink>
            <QuickActionLink href="/earnings">
              <QuickIcon aria-hidden>💰</QuickIcon>
              Earnings
            </QuickActionLink>
            <QuickActionLink href="/notifications">
              <QuickIcon aria-hidden>
                🔔
                {alertCount > 0 && (
                  <CompactCountBubble>
                    {compactCount(alertCount)}
                  </CompactCountBubble>
                )}
              </QuickIcon>
              Notifications
            </QuickActionLink>
            <QuickActionLink href="/vendor/settings">
              <QuickIcon aria-hidden>⋯</QuickIcon>
              More
            </QuickActionLink>
          </QuickActionsGrid>

          {(incoming?.length ?? 0) > 0 && (
            <IncomingSection>
              <IncomingHeader>
                <IncomingTitle>
                  <span aria-hidden>🔔</span>
                  Incoming orders
                </IncomingTitle>
                <LivePulse>Live</LivePulse>
              </IncomingHeader>
              <div>
                {(incoming ?? []).slice(0, 6).map((o) => (
                  <IncomingRow key={o.id}>
                    <IncomingLeft>
                      <Row $gap={8} $align="center">
                        <Text $weight={700} $size={14}>
                          #{o.orderNumber}
                        </Text>
                        <Badge $tone={orderTone(o.status)}>
                          {statusLabel(o.status)}
                        </Badge>
                      </Row>
                      <IncomingMeta>
                        {o.fulfillmentType === "DELIVERY"
                          ? "🛵 Delivery"
                          : "🥡 Pickup"}{" "}
                        · {o.items.reduce((n, it) => n + it.quantity, 0)} item
                        {o.items.reduce((n, it) => n + it.quantity, 0) === 1
                          ? ""
                          : "s"}
                      </IncomingMeta>
                    </IncomingLeft>
                    <IncomingRight>
                      <IncomingAmount>{formatKobo(o.totalKobo)}</IncomingAmount>
                      <CookLink href="/pipeline">
                        View <span aria-hidden>→</span>
                      </CookLink>
                    </IncomingRight>
                  </IncomingRow>
                ))}
              </div>
            </IncomingSection>
          )}

          <div>
            <OrdersHeader>
              <OrdersTitle>
                <span aria-hidden>📋</span>
                Today's orders
              </OrdersTitle>
              <ViewAllLink href="/dashboard">
                View all <span aria-hidden>›</span>
              </ViewAllLink>
            </OrdersHeader>

            <Stack $gap={10} style={{ marginBottom: 14 }}>
              <FilterChips role="group" aria-label="Filter by status">
                {STATUS_FILTERS.map((s) => (
                  <Chip
                    key={s.label}
                    type="button"
                    $on={statusFilter === s.value}
                    aria-pressed={statusFilter === s.value}
                    onClick={() => setStatusFilter(s.value)}>
                    {s.label}
                  </Chip>
                ))}
              </FilterChips>
              <Input
                type="search"
                placeholder="Search by title…"
                aria-label="Search daily orders by title"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <DateRange>
                <Input
                  type="date"
                  label="From"
                  aria-label="Scheduled from date"
                  value={fromDate}
                  max={toDate || undefined}
                  onChange={(e) => setFromDate(e.target.value)}
                />
                <Input
                  type="date"
                  label="To"
                  aria-label="Scheduled to date"
                  value={toDate}
                  min={fromDate || undefined}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </DateRange>
              {hasFilters && (
                <Row $justify="flex-end">
                  <Button
                    $size="sm"
                    $variant="secondary"
                    onClick={clearFilters}>
                    Clear filters
                  </Button>
                </Row>
              )}
            </Stack>

            {listLoading ? (
              <Stack $gap={12}>
                {[0, 1, 2].map((i) => (
                  <Card key={i}>
                    <Stack $gap={10}>
                      <Skeleton $w="55%" $h={20} />
                      <Skeleton $w="80%" $h={14} />
                      <Skeleton $w="40%" $h={14} />
                    </Stack>
                  </Card>
                ))}
              </Stack>
            ) : list.length === 0 ? (
              <EmptyState
                icon="🍲"
                title={
                  hasFilters
                    ? "No matching daily orders"
                    : "No daily orders yet"
                }
                description={
                  hasFilters
                    ? "No listings match these filters. Try widening your search."
                    : "Post your first daily order to start selling today."
                }
                action={
                  hasFilters ? (
                    <Button $variant="secondary" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <Stack $gap={10}>
                {list.map((o, i) => {
                  const closed = timeUntil(o.cutoffTime) === "closed";
                  const comingSoon = o.availableFrom
                    ? new Date(o.availableFrom).getTime() > Date.now()
                    : false;
                  const editable =
                    comingSoon &&
                    o.status !== "CLOSED" &&
                    o.status !== "CANCELLED";
                  const thumb = o.items.find((it) => it.snapshotImageUrl);
                  return (
                    <FadeIn key={o.id} $delay={i * 40}>
                      <OrderRowWrap href={`/dashboard/${o.id}`}>
                        <OrderThumb>
                          {thumb?.snapshotImageUrl ? (
                            <OrderThumbImg
                              src={thumb.snapshotImageUrl}
                              alt=""
                              loading="lazy"
                            />
                          ) : (
                            <span aria-hidden>🍲</span>
                          )}
                        </OrderThumb>
                        <OrderBody>
                          <OrderTopRow>
                            <OrderTitle>{o.title}</OrderTitle>
                            <OrderStatusPill $tone={statusTone(o.status)}>
                              {statusLabel(o.status)}
                            </OrderStatusPill>
                          </OrderTopRow>
                          <Row $gap={8} $align="center">
                            <OrderMeta>
                              {formatDate(o.scheduledDate)} · {o.items.length}{" "}
                              item
                              {o.items.length === 1 ? "" : "s"}
                            </OrderMeta>
                            {o.status === "ACTIVE" &&
                              !comingSoon &&
                              !closed && (
                                <OrderMeta>
                                  •{timeUntil(o.cutoffTime)}
                                </OrderMeta>
                              )}
                            {o.status === "ACTIVE" && closed && (
                              <Badge $tone="danger">Cutoff passed</Badge>
                            )}
                          </Row>
                          {(editable || o.status === "ACTIVE") && (
                            <OrderActions>
                              {editable && (
                                <OrderActionLink
                                  href={`/dashboard/${o.id}/edit`}>
                                  <span aria-hidden>✏️</span> Edit
                                </OrderActionLink>
                              )}
                              {o.status === "ACTIVE" && (
                                <OrderCloseBtn
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    closeListing(o);
                                  }}>
                                  Close
                                </OrderCloseBtn>
                              )}
                            </OrderActions>
                          )}
                        </OrderBody>
                        <OrderChevron aria-hidden>›</OrderChevron>
                      </OrderRowWrap>
                    </FadeIn>
                  );
                })}
              </Stack>
            )}
          </div>
        </Stack>
      </DashboardShell>
    </FadeIn>
  );
}
