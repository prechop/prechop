"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import useSWR from "swr";
import {
	Badge,
	Button,
	Card,
	FadeIn,
	Input,
	Row,
	SectionHeader,
	Stack,
	Text,
	Textarea,
	Title,
	useListingStatus,
	VendorStatusBadge,
} from "@/components";
import { PageLoader } from "@/components/Loader";
import { api } from "@/constants/api";
import { calculateBuyerServiceFeeKobo } from "@/constants/fees";
import { fetcher } from "@/constants/fetcher";
import { formatDate, formatKobo } from "@/constants/formatters";
import { useAuth } from "@/hooks/Auth/useAuth";
import { describeBuyerFeeExplainer, useFeePolicy } from "@/hooks/useFeePolicy";
import { useToast } from "@/hooks/useToast";
import type {
	DailyOrder,
	DailyOrderItem,
	DailyOrderOptionGroup,
} from "@/types";

type Fulfillment = "PICKUP" | "DELIVERY";
type PaymentMode = "SELF" | "PAY_FOR_ME";
type Line = { quantity: number; optionQuantities: Record<string, number> };
type SavedLine = {
	quantity: number;
	optionQuantities?: Record<string, number>;
	optionIds?: string[];
};
interface ExternalPaymentResult {
	buyerOrderId: string;
	orderNumber: string;
	externalPaymentUrl: string;
	externalPaymentExpiresAt?: string;
}
interface MarketplaceAvailability {
	marketplaceEnabled: boolean;
}

// Per-order server limit — placeOrderBodySchema caps each item's quantity at 50.
const MAX_PER_ORDER = 50;

/**
 * PRD §8.7: the buyer must see the service fee as an explicit line item BEFORE
 * paying, never for the first time on the Paystack page. The Subtotal/Service
 * fee/Total block below is that line item.
 *
 * The quote is now sound. `useFeePolicy` reads the effective, admin-governed
 * policy from `GET /api/site-configs/marketplace` — resolved server-side through
 * the same `resolveFeePolicy` guard `placeOrder` charges with — and that policy
 * is passed explicitly into `calculateBuyerServiceFeeKobo`. Quote and charge run
 * the same maths over the same numbers.
 *
 * This previously drifted: the call site passed no policy, so it fell back to
 * `DEFAULT_FEE_POLICY`, which is env-sourced and cannot reach the browser
 * (`PLATFORM_FEE_*` has no `NEXT_PUBLIC_` prefix, so the client read is always
 * `undefined` and `readFee` returned its hardcoded fallback). The client quoted
 * 3%/₦200 no matter what the server charged; the two only agreed while an
 * unseeded siteConfigs happened to resolve to the same env defaults.
 *
 * Do NOT reintroduce a default here. If the policy cannot be read we render the
 * fee as unknown and block checkout rather than quote a number — a wrong quote
 * on a money path is the exact failure PRD §8.7 exists to prevent.
 */

/** Units of an item the buyer may still add: the smaller of the remaining
 *  listing capacity (maxQuantity − orderedQuantity) and the per-order limit.
 *  Infinite-capacity items (null maxQuantity) are bounded only by the limit. */
function remainingCap(item: DailyOrderItem): number {
	if (item.maxQuantity == null) return MAX_PER_ORDER;
	return Math.max(
		0,
		Math.min(MAX_PER_ORDER, item.maxQuantity - item.orderedQuantity),
	);
}

const Wrap = styled(Stack)`
  max-width: 640px;
  margin: 0 auto;
`;
const Hero = styled(Card)`
  padding: 0;
  overflow: hidden;
`;
const Cover = styled.div<{ $src?: string }>`
  position: relative;
  height: 180px;
  background: ${(p) =>
		p.$src
			? `center / cover no-repeat url(${p.$src})`
			: "var(--pc-gradient-calm-orange)"};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 56px;
  &::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, transparent 45%, rgba(0, 0, 0, 0.22));
  }
`;
const HeroBody = styled(Stack)`
  padding: var(--pc-space-5);
`;
const Chips = styled(Row)`
  flex-wrap: wrap;
`;
const ShopLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  padding: 6px 12px;
  border-radius: var(--pc-radius-pill);
  background: var(--pc-surface-2);
  border: 1px solid var(--pc-border);
  font-size: 13.5px;
  font-weight: 700;
  color: var(--pc-color-primary);
  transition: border-color var(--pc-dur) var(--pc-ease);
  &:hover {
    border-color: var(--pc-color-primary);
  }
`;
const Chip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 11px;
  border-radius: var(--pc-radius-pill);
  background: var(--pc-surface-2);
  border: 1px solid var(--pc-border);
  font-size: 12.5px;
  font-weight: 600;
  color: var(--pc-text-muted);
`;
const PickupLocation = styled.div`
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 10px 12px;
  border-radius: var(--pc-radius-sm);
  background: var(--pc-surface-2);
  border: 1px solid var(--pc-border);
  color: var(--pc-text-muted);
  font-size: 13.5px;
  line-height: 1.45;
`;
const ItemCard = styled(Card)`
  padding: var(--pc-space-4);
  transition: border-color var(--pc-dur) var(--pc-ease);
  &:hover {
    border-color: var(--pc-surface-3);
  }
`;
const SoldOut = styled(ItemCard)`
  opacity: 0.55;
`;
const Thumb = styled.div<{ $src?: string }>`
  width: 52px;
  height: 52px;
  flex: 0 0 auto;
  border-radius: var(--pc-radius-sm);
  background: ${(p) =>
		p.$src
			? `center / cover no-repeat url(${p.$src})`
			: "var(--pc-color-primary-50)"};
  display: grid;
  place-items: center;
  font-size: 24px;
`;
const AddonRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--pc-text-muted);
  padding: 6px 0;
  min-width: 0;
`;
const AddonQty = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  border: 1px solid var(--pc-border);
  border-radius: var(--pc-radius-pill);
  padding: 2px;
  background: var(--pc-surface-2);
`;
const AddonQtyBtn = styled.button`
  border: 0;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--pc-surface);
  color: var(--pc-text);
  font-size: 16px;
  font-weight: 800;
  cursor: pointer;
`;
const AddonQtyValue = styled.span`
  min-width: 18px;
  text-align: center;
  font-size: 13px;
  font-weight: 800;
  color: var(--pc-text);
`;
const AddonBox = styled.div`
  border-top: 1px dashed var(--pc-border);
  padding-top: var(--pc-space-2);
  margin-top: var(--pc-space-1);
`;
const GroupHead = styled(Row)`
  justify-content: space-between;
  align-items: baseline;
  margin-top: var(--pc-space-2);
`;
const GroupRule = styled.span<{ $unmet?: boolean }>`
  font-size: 11.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: ${(p) =>
		p.$unmet ? "var(--pc-color-danger)" : "var(--pc-text-muted)"};
`;
const Qty = styled(Row)`
  background: var(--pc-surface-2);
  border-radius: var(--pc-radius-pill);
  padding: 3px;
  button {
    width: 32px;
    height: 32px;
    padding: 0;
    font-size: 18px;
    border-radius: 50%;
  }
`;
const FeeRow = styled(Row)`
  justify-content: space-between;
  font-size: 14px;
`;
const InfoButton = styled.button`
  border: 0;
  background: var(--pc-surface-2);
  color: var(--pc-text-muted);
  width: 18px;
  height: 18px;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
`;
const Sticky = styled.div`
  position: sticky;
  bottom: 0;
  background: var(--pc-surface);
  border-top: 1px solid var(--pc-border);
  box-shadow: 0 -6px 20px rgba(0, 0, 0, 0.06);
  padding: var(--pc-space-4) 0;
  margin: 0 calc(-1 * var(--pc-space-4));
  padding-left: var(--pc-space-4);
  padding-right: var(--pc-space-4);
`;
const Toggle = styled.button<{ $active: boolean }>`
  flex: 1;
  border: 1.5px solid
    ${(p) => (p.$active ? "var(--pc-color-primary)" : "var(--pc-border)")};
  background: ${(p) =>
		p.$active ? "var(--pc-color-primary-50)" : "var(--pc-surface)"};
  color: ${(p) =>
		p.$active ? "var(--pc-color-primary)" : "var(--pc-text-muted)"};
  font-weight: 700;
  padding: 12px;
  border-radius: var(--pc-radius-sm);
  cursor: pointer;
  transition: all var(--pc-dur) var(--pc-ease);
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

function allOptions(item: DailyOrderItem) {
	return (item.optionGroups ?? []).flatMap((g) => g.options);
}

function lineSubtotal(item: DailyOrderItem, line: Line): number {
	const optionSum = allOptions(item).reduce(
		(s, o) => s + o.priceKobo * (line.optionQuantities[o.id] ?? 0),
		0,
	);
	return item.snapshotPriceKobo * line.quantity + optionSum;
}

/** Effective minimum selections for a group (required ⇒ at least 1). */
function groupMin(group: DailyOrderOptionGroup): number {
	return group.required
		? Math.max(1, group.minSelect ?? 0)
		: (group.minSelect ?? 0);
}

function groupSelectedCount(group: DailyOrderOptionGroup, line: Line): number {
	return group.options.filter((o) => (line.optionQuantities[o.id] ?? 0) > 0)
		.length;
}

/** A group is satisfied when its selection count is within [min, max]. */
function groupSatisfied(group: DailyOrderOptionGroup, line: Line): boolean {
	const count = groupSelectedCount(group, line);
	if (count < groupMin(group)) return false;
	if (group.maxSelect != null && count > group.maxSelect) return false;
	return true;
}

/** Every selected item must satisfy all of its required/bounded groups. */
function itemOptionsValid(item: DailyOrderItem, line: Line): boolean {
	return (item.optionGroups ?? []).every((g) => groupSatisfied(g, line));
}

/** Short human hint describing a group's selection rule. */
function ruleLabel(group: DailyOrderOptionGroup, min: number): string {
	if (min > 0 && group.maxSelect === min)
		return min === 1 ? "Required · pick 1" : `Required · pick ${min}`;
	if (min > 0 && group.maxSelect != null)
		return `Required · pick ${min}–${group.maxSelect}`;
	if (min > 0) return `Required · pick at least ${min}`;
	if (group.maxSelect != null) return `Optional · up to ${group.maxSelect}`;
	return "Optional";
}

export default function OrderDetailWrapper({ token }: { token: string }) {
	const router = useRouter();
	const { user, isAuthenticated, isLoading: authLoading } = useAuth();
	const { toast } = useToast();

	const { data: availability, isLoading: availabilityLoading } =
		useSWR<MarketplaceAvailability>("/site-configs/marketplace", fetcher, {
			refreshInterval: 10_000,
		});
	const marketplaceEnabled = availability?.marketplaceEnabled !== false;
	// Same SWR key as `availability` above, so this is the same cached request —
	// the fee policy rides along on the poll that was already happening.
	const { policy: feePolicy } = useFeePolicy();
	const { data, isLoading, error } = useSWR<DailyOrder>(
		marketplaceEnabled ? `/daily-orders/public/${token}` : null,
		fetcher,
	);

	const [lines, setLines] = useState<Record<string, Line>>({});
	const [fulfillment, setFulfillment] = useState<Fulfillment>("PICKUP");
	const [hostel, setHostel] = useState("");
	const [room, setRoom] = useState("");
	const [extra, setExtra] = useState("");
	const [deliveryPhone, setDeliveryPhone] = useState("");
	const [customerMessage, setCustomerMessage] = useState("");
	const [paymentMode, setPaymentMode] = useState<PaymentMode>("SELF");
	const [externalPayment, setExternalPayment] =
		useState<ExternalPaymentResult | null>(null);
	const [placing, setPlacing] = useState(false);
	const cartStorageKey = `pch-cart-${token}`;

	// Single source of truth for availability, shared with the marketplace and
	// the storefront, and re-derived on a 30s tick. This replaces three inline
	// booleans (closed/inactive/notStarted) that never consulted the vendor's
	// `vendorOpen` kill switch and never re-evaluated after mount — so a kitchen
	// that had switched itself off still rendered a live "2h left" countdown.
	const status = useListingStatus(data, { vendorOpen: data?.vendorOpen });
	// `orderable` is true only when a buyer can actually add to cart right now:
	// false for a closed kitchen, an inactive/past-cutoff listing, AND for a
	// listing that is visible but hasn't opened yet ("Opens 11:30am").
	const orderable = status?.orderable ?? false;

	useEffect(() => {
		if (!data) return;
		setFulfillment((current) => {
			if (data.deliveryAvailable && !data.pickupAvailable)
				return "DELIVERY";
			if (data.pickupAvailable && !data.deliveryAvailable)
				return "PICKUP";
			if (current === "DELIVERY" && !data.deliveryAvailable)
				return "PICKUP";
			if (current === "PICKUP" && !data.pickupAvailable)
				return "DELIVERY";
			return current;
		});
	}, [data]);

	useEffect(() => {
		if (!user?.phone || deliveryPhone.trim()) return;
		setDeliveryPhone(user.phone);
	}, [deliveryPhone, user?.phone]);

	const { subtotal, itemCount, optionsValid } = useMemo(() => {
		if (!data) return { subtotal: 0, itemCount: 0, optionsValid: true };
		let sub = 0;
		let count = 0;
		let valid = true;
		for (const item of data.items) {
			const line = lines[item.id];
			if (!line || line.quantity <= 0) continue;
			sub += lineSubtotal(item, line);
			count += line.quantity;
			if (!itemOptionsValid(item, line)) valid = false;
		}
		return { subtotal: sub, itemCount: count, optionsValid: valid };
	}, [data, lines]);

	useEffect(() => {
		if (!data || typeof window === "undefined") return;
		const saved = window.sessionStorage.getItem(cartStorageKey);
		if (!saved) return;
		try {
			const parsed = JSON.parse(saved) as {
				lines?: Record<string, SavedLine>;
				fulfillment?: Fulfillment;
				hostel?: string;
				room?: string;
				extra?: string;
				deliveryPhone?: string;
				customerMessage?: string;
				paymentMode?: PaymentMode;
			};
			if (parsed.lines) {
				setLines(
					Object.fromEntries(
						Object.entries(parsed.lines).map(([id, line]) => [
							id,
							{
								quantity: line.quantity,
								optionQuantities:
									line.optionQuantities ??
									Object.fromEntries(
										(line.optionIds ?? []).map((id) => [
											id,
											line.quantity,
										]),
									),
							},
						]),
					),
				);
			}
			if (parsed.fulfillment) setFulfillment(parsed.fulfillment);
			setHostel(parsed.hostel ?? "");
			setRoom(parsed.room ?? "");
			setExtra(parsed.extra ?? "");
			setDeliveryPhone(parsed.deliveryPhone ?? user?.phone ?? "");
			setCustomerMessage(parsed.customerMessage ?? "");
			if (parsed.paymentMode) setPaymentMode(parsed.paymentMode);
			window.sessionStorage.removeItem(cartStorageKey);
		} catch {
			window.sessionStorage.removeItem(cartStorageKey);
		}
	}, [cartStorageKey, data, user?.phone]);

	/**
	 * "Order again" prefill. ReorderSheet writes the resolvable lines under
	 * `pch-reorder-{dailyOrderId}` and sends the buyer here.
	 *
	 * Declared after the login-cart effect so a fresh reorder intent wins over a
	 * stale saved cart. The key is cleared the moment it is read: the seed is a
	 * one-shot handoff, not cart state, so a refresh must not resurrect it.
	 *
	 * Everything is re-validated against the listing we actually loaded — the
	 * preview was computed server-side moments ago, but an item can sell out in
	 * between, so quantities are clamped to what's still available and unknown
	 * items are dropped rather than trusted.
	 */
	useEffect(() => {
		if (!data || typeof window === "undefined") return;
		const key = `pch-reorder-${data.id}`;
		const saved = window.sessionStorage.getItem(key);
		if (!saved) return;
		window.sessionStorage.removeItem(key);
		try {
			const seed = JSON.parse(saved) as Array<{
				dailyOrderItemId: string;
				quantity: number;
				selectedOptionIds?: string[];
			}>;
			if (!Array.isArray(seed) || seed.length === 0) return;
			const byId = new Map(data.items.map((it) => [it.id, it]));
			const next: Record<string, Line> = {};
			for (const row of seed) {
				const item = byId.get(row.dailyOrderItemId);
				if (!item) continue;
				const quantity = Math.min(
					Math.max(1, Math.floor(row.quantity)),
					remainingCap(item),
				);
				if (quantity <= 0) continue;
				// Only keep options that still exist on today's snapshot.
				const live = new Set(allOptions(item).map((o) => o.id));
				next[item.id] = {
					quantity,
					optionQuantities: Object.fromEntries(
						(row.selectedOptionIds ?? [])
							.filter((id) => live.has(id))
							.map((id) => [id, quantity]),
					),
				};
			}
			if (Object.keys(next).length > 0) setLines(next);
		} catch {
			// Malformed seed — already cleared above; fall through to an empty cart.
		}
	}, [data]);

	if (availabilityLoading || isLoading || authLoading) return <PageLoader />;
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
	if (!data) {
		return (
			<Wrap>
				<Card $accent>
					<Stack $gap={6}>
						<Title $size={18}>Listing not found</Title>
						<Text $muted>
							This listing may have closed or the link is invalid.
						</Text>
					</Stack>
				</Card>
			</Wrap>
		);
	}
	// A seller can't order from their own kitchen. The server flags this on the
	// listing response and enforces it in placeOrder; here we simply refuse to
	// render the cart/checkout and point them at their vendor tools instead.
	if (data.isOwnListing) {
		return (
			<Wrap>
				<Card $accent>
					<Stack $gap={10}>
						<Title $size={20}>This is your listing</Title>
						<Text $muted>
							You can't place an order from your own kitchen.
							Manage this listing from your dashboard, or head to
							the marketplace to order from other vendors.
						</Text>
						<Row $gap={10}>
							<Button onClick={() => router.push("/dashboard")}>
								Go to dashboard
							</Button>
							<Button
								$variant="secondary"
								onClick={() => router.push("/marketplace")}
							>
								Browse marketplace
							</Button>
						</Row>
					</Stack>
				</Card>
			</Wrap>
		);
	}
	// The vendor has closed their kitchen — no new orders until they reopen. The
	// server enforces this in placeOrder; here we refuse to render checkout.
	if (data.vendorOpen === false) {
		return (
			<Wrap>
				<Card $accent>
					<Stack $gap={10}>
						<Title $size={20}>{data.title}</Title>
						<Badge $tone="danger">Kitchen closed</Badge>
						<Text $muted>
							This kitchen isn't accepting orders right now. Check
							back later, or browse other campus kitchens cooking
							today.
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

	// A fee can only be quoted against a policy the server actually sent. Without
	// one we deliberately do NOT fall back to a default: quoting ₦0 (or a stale
	// 3%) understates the total the buyer is about to be charged.
	const canQuoteFee = !!feePolicy;
	const processingFee =
		itemCount > 0 && feePolicy
			? calculateBuyerServiceFeeKobo(subtotal, feePolicy)
			: 0;
	const deliveryFee =
		fulfillment === "DELIVERY" && data.deliveryAvailable
			? data.deliveryFeeKobo
			: 0;
	const checkoutTotal = subtotal + deliveryFee + processingFee;
	const feeExplainer = describeBuyerFeeExplainer(feePolicy);
	const canOrder = orderable && itemCount > 0 && optionsValid && canQuoteFee;

	function saveCartForLogin() {
		if (typeof window === "undefined") return;
		window.sessionStorage.setItem(
			cartStorageKey,
			JSON.stringify({
				lines: Object.fromEntries(
					Object.entries(lines).map(([id, line]) => [
						id,
						{
							quantity: line.quantity,
							optionQuantities: line.optionQuantities,
						},
					]),
				),
				fulfillment,
				hostel,
				room,
				extra,
				deliveryPhone,
				customerMessage,
				paymentMode,
			}),
		);
	}

	function setQty(item: DailyOrderItem, delta: number) {
		setLines((prev) => {
			const cur = prev[item.id] ?? {
				quantity: 0,
				optionQuantities: {},
			};
			// Cap at what's actually still available (maxQuantity − already
			// ordered), and never above the server's per-order limit of 50, so
			// the buyer can't select more than checkout would accept.
			const next = Math.max(
				0,
				Math.min(remainingCap(item), cur.quantity + delta),
			);
			return { ...prev, [item.id]: { ...cur, quantity: next } };
		});
	}

	/**
	 * Toggle an option within a group. Single-select groups (maxSelect === 1)
	 * behave like radios — picking one clears the group's other choices; picking
	 * the current one again clears it only when the group is optional. Multi-
	 * select groups honour `maxSelect` by ignoring picks past the cap.
	 */
	function toggleOption(
		item: DailyOrderItem,
		group: DailyOrderOptionGroup,
		optionId: string,
	) {
		setLines((prev) => {
			const cur = prev[item.id] ?? { quantity: 1, optionQuantities: {} };
			const optionQuantities = { ...cur.optionQuantities };
			const groupIds = group.options.map((o) => o.id);
			const single = group.maxSelect === 1;

			if ((optionQuantities[optionId] ?? 0) > 0) {
				if (single && group.required) {
					// keep it selected (radio can't be emptied when required)
				} else {
					delete optionQuantities[optionId];
				}
			} else if (single) {
				for (const gid of groupIds) delete optionQuantities[gid];
				optionQuantities[optionId] = 1;
			} else {
				const count = groupIds.filter(
					(gid) => (optionQuantities[gid] ?? 0) > 0,
				).length;
				if (group.maxSelect == null || count < group.maxSelect)
					optionQuantities[optionId] = 1;
			}
			const quantity = cur.quantity === 0 ? 1 : cur.quantity;
			return { ...prev, [item.id]: { quantity, optionQuantities } };
		});
	}

	function setOptionQty(
		item: DailyOrderItem,
		optionId: string,
		delta: number,
	) {
		setLines((prev) => {
			const cur = prev[item.id] ?? { quantity: 1, optionQuantities: {} };
			const current = cur.optionQuantities[optionId] ?? 0;
			const next = Math.max(0, Math.min(MAX_PER_ORDER, current + delta));
			const optionQuantities = { ...cur.optionQuantities };
			if (next === 0) delete optionQuantities[optionId];
			else optionQuantities[optionId] = next;
			const quantity = cur.quantity === 0 ? 1 : cur.quantity;
			return { ...prev, [item.id]: { quantity, optionQuantities } };
		});
	}

	async function checkout() {
		if (!data) return;
		if (!isAuthenticated) {
			saveCartForLogin();
			router.push(`/login?next=${encodeURIComponent(`/o/${token}`)}`);
			return;
		}
		if (itemCount > 0 && !optionsValid) {
			toast(
				"Please complete the required options on your items.",
				"error",
			);
			return;
		}
		if (!canOrder) return;
		if (
			fulfillment === "DELIVERY" &&
			(!deliveryPhone.trim() || !hostel.trim() || !room.trim())
		) {
			toast("Add your phone, hostel and room for delivery.", "error");
			return;
		}
		const items = Object.entries(lines)
			.filter(([, l]) => l.quantity > 0)
			.map(([dailyOrderItemId, l]) => ({
				dailyOrderItemId,
				quantity: l.quantity,
				selectedOptions: Object.entries(l.optionQuantities)
					.filter(([, quantity]) => quantity > 0)
					.map(([optionId, quantity]) => ({
						optionId,
						quantity,
					})),
			}));

		setPlacing(true);
		try {
			const res = await api.post("/orders", {
				dailyOrderId: data.id,
				paymentMode,
				fulfillmentType: fulfillment,
				...(fulfillment === "DELIVERY"
					? {
							deliveryHostelName: hostel.trim(),
							deliveryRoomNumber: room.trim(),
							deliveryAdditionalInfo: extra.trim() || undefined,
							deliveryPhone: deliveryPhone.trim(),
						}
					: {}),
				customerMessage: customerMessage.trim() || undefined,
				items,
			});
			const payload = res.data?.data as {
				buyerOrderId: string;
				orderNumber: string;
				paymentUrl?: string;
				paystackRef?: string;
				externalPaymentUrl?: string;
				externalPaymentExpiresAt?: string;
			};
			if (paymentMode === "PAY_FOR_ME") {
				if (!payload.externalPaymentUrl) {
					throw new Error("Missing payment request link");
				}
				setExternalPayment({
					buyerOrderId: payload.buyerOrderId,
					orderNumber: payload.orderNumber,
					externalPaymentUrl: payload.externalPaymentUrl,
					externalPaymentExpiresAt: payload.externalPaymentExpiresAt,
				});
				toast("Payment request created.", "success");
				setPlacing(false);
				return;
			}
			// Remember the mapping so the Paystack callback can resolve the order.
			if (typeof window !== "undefined" && payload.paystackRef) {
				window.localStorage.setItem(
					`pch-pay-${payload.paystackRef}`,
					JSON.stringify({
						buyerOrderId: payload.buyerOrderId,
						orderNumber: payload.orderNumber,
					}),
				);
			}
			if (!payload.paymentUrl) throw new Error("Missing payment URL");
			window.location.href = payload.paymentUrl;
		} catch (e) {
			toast(errMsg(e), "error");
			setPlacing(false);
		}
	}

	async function copyExternalLink() {
		if (!externalPayment) return;
		await navigator.clipboard.writeText(externalPayment.externalPaymentUrl);
		toast("Payment link copied.", "success");
	}

	function shareExternalOnWhatsApp() {
		if (!externalPayment) return;
		const text = `Please help pay for my Prechop order ${externalPayment.orderNumber}: ${externalPayment.externalPaymentUrl}`;
		window.open(
			`https://wa.me/?text=${encodeURIComponent(text)}`,
			"_blank",
			"noopener,noreferrer",
		);
	}

	async function cancelExternalRequest() {
		if (!externalPayment) return;
		setPlacing(true);
		try {
			await api.post(
				`/orders/${externalPayment.buyerOrderId}/external-payment/cancel`,
				{},
			);
			toast("Payment request cancelled.", "success");
			setExternalPayment(null);
		} catch (error) {
			toast(errMsg(error), "error");
		} finally {
			setPlacing(false);
		}
	}

	async function payExternalOrderNow() {
		if (!externalPayment) return;
		setPlacing(true);
		try {
			const res = await api.post(
				`/orders/${externalPayment.buyerOrderId}/pay`,
				{},
			);
			const payload = res.data?.data as {
				buyerOrderId: string;
				orderNumber: string;
				paymentUrl?: string;
				paystackRef?: string;
			};
			if (typeof window !== "undefined" && payload.paystackRef) {
				window.localStorage.setItem(
					`pch-pay-${payload.paystackRef}`,
					JSON.stringify({
						buyerOrderId: payload.buyerOrderId,
						orderNumber: payload.orderNumber,
					}),
				);
			}
			if (!payload.paymentUrl) throw new Error("Missing payment URL");
			setExternalPayment(null);
			window.location.href = payload.paymentUrl;
		} catch (error) {
			toast(errMsg(error), "error");
			setPlacing(false);
		}
	}

	return (
		<Wrap $gap={16}>
			<FadeIn>
				<Hero>
					<Cover $src={data.items[0]?.snapshotImageUrl}>
						{data.items[0]?.snapshotImageUrl ? "" : "🍲"}
					</Cover>
					<HeroBody $gap={12}>
						<Row
							$justify="space-between"
							$align="flex-start"
							$gap={10}
						>
							<Title $size={24}>{data.title}</Title>
							{status && (
								<VendorStatusBadge status={status} live />
							)}
						</Row>
						{data.vendorId && (
							<ShopLink href={`/v/${data.vendorId}`}>
								🏪 {data.vendorName ?? "View shop"} · See all
								listings →
							</ShopLink>
						)}
						<Chips $gap={8}>
							{data.pickupAvailable && <Chip>🥡 Pickup</Chip>}
							{data.deliveryAvailable && (
								<Chip>
									🛵 Vendor-managed delivery{" "}
									{formatKobo(data.deliveryFeeKobo)}
								</Chip>
							)}
						</Chips>
						{fulfillment === "PICKUP" &&
							(data.vendorPickupLocation || data.vendorPhone) && (
								<PickupLocation>
									<span aria-hidden>📍</span>
									<span>
										{data.vendorPickupLocation && (
											<>
												Pick up at{" "}
												<strong>
													{data.vendorPickupLocation}
												</strong>
											</>
										)}
										{data.vendorPhone && (
											<>
												{data.vendorPickupLocation && (
													<br />
												)}
												Call vendor:{" "}
												<a
													href={`tel:${data.vendorPhone}`}
												>
													{data.vendorPhone}
												</a>
											</>
										)}
									</span>
								</PickupLocation>
							)}
					</HeroBody>
				</Hero>
			</FadeIn>

			<SectionHeader title="Menu" icon="🍽️" />
			<Stack $gap={10}>
				{data.items.map((item) => {
					const line = lines[item.id];
					const qty = line?.quantity ?? 0;
					const listingSoldOut =
						item.maxQuantity != null &&
						item.orderedQuantity >= item.maxQuantity;
					const Wrapper = listingSoldOut ? SoldOut : ItemCard;
					return (
						<Wrapper key={item.id}>
							<Stack $gap={10}>
								<Row
									$justify="space-between"
									$align="center"
									$gap={12}
								>
									<Row $gap={12} $align="center">
										<Thumb
											$src={item.snapshotImageUrl}
											aria-hidden
										>
											{item.snapshotImageUrl ? "" : "🍛"}
										</Thumb>
										<Stack $gap={2}>
											<Text $weight={700}>
												{item.snapshotName}
											</Text>
											<Text $muted $size={13}>
												{formatKobo(
													item.snapshotPriceKobo,
												)}{" "}
												· {item.snapshotPrepMin}m prep
											</Text>
										</Stack>
									</Row>
									{listingSoldOut ? (
										<Badge $tone="danger">Sold out</Badge>
									) : (
										<Qty $gap={6}>
											<Button
												$variant="secondary"
												$size="sm"
												onClick={() => setQty(item, -1)}
												aria-label={`Remove one ${item.snapshotName}`}
												disabled={
													qty === 0 || !orderable
												}
											>
												−
											</Button>
											<Text
												$weight={700}
												style={{
													minWidth: 18,
													textAlign: "center",
												}}
											>
												{qty}
											</Text>
											<Button
												$variant="secondary"
												$size="sm"
												onClick={() => setQty(item, 1)}
												aria-label={`Add one ${item.snapshotName}`}
												disabled={
													!orderable ||
													qty >= remainingCap(item)
												}
											>
												＋
											</Button>
										</Qty>
									)}
								</Row>
								{qty > 0 &&
									(item.optionGroups ?? []).length > 0 && (
										<AddonBox>
											<Stack $gap={8}>
												{item.optionGroups.map(
													(group) => {
														const min =
															groupMin(group);
														const satisfied =
															!line ||
															groupSatisfied(
																group,
																line,
															);
														const single =
															group.maxSelect ===
															1;
														return (
															<Stack
																key={group.id}
																$gap={2}
															>
																<GroupHead>
																	<Text
																		$weight={
																			700
																		}
																		$size={
																			13.5
																		}
																	>
																		{
																			group.name
																		}
																	</Text>
																	<GroupRule
																		$unmet={
																			!satisfied
																		}
																	>
																		{ruleLabel(
																			group,
																			min,
																		)}
																	</GroupRule>
																</GroupHead>
																{group.options.map(
																	(o) => {
																		const optionQty =
																			line
																				?.optionQuantities[
																				o
																					.id
																			] ??
																			0;
																		const checked =
																			optionQty >
																			0;
																		const count =
																			line
																				? groupSelectedCount(
																						group,
																						line,
																					)
																				: 0;
																		const capHit =
																			!single &&
																			!checked &&
																			group.maxSelect !=
																				null &&
																			count >=
																				group.maxSelect;
																		return (
																			<AddonRow
																				key={
																					o.id
																				}
																			>
																				<input
																					type={
																						single
																							? "radio"
																							: "checkbox"
																					}
																					name={`grp-${group.id}`}
																					checked={
																						checked
																					}
																					disabled={
																						capHit
																					}
																					onChange={() =>
																						toggleOption(
																							item,
																							group,
																							o.id,
																						)
																					}
																				/>
																				{
																					o.name
																				}
																				{o.priceKobo >
																				0
																					? ` · ${formatKobo(o.priceKobo)}`
																					: ""}
																				{checked &&
																					!single && (
																						<AddonQty>
																							<AddonQtyBtn
																								type="button"
																								aria-label={`Remove one ${o.name}`}
																								onClick={() =>
																									setOptionQty(
																										item,
																										o.id,
																										-1,
																									)
																								}
																							>
																								-
																							</AddonQtyBtn>
																							<AddonQtyValue>
																								{
																									optionQty
																								}
																							</AddonQtyValue>
																							<AddonQtyBtn
																								type="button"
																								aria-label={`Add one ${o.name}`}
																								onClick={() =>
																									setOptionQty(
																										item,
																										o.id,
																										1,
																									)
																								}
																								disabled={
																									optionQty >=
																									MAX_PER_ORDER
																								}
																							>
																								+
																							</AddonQtyBtn>
																						</AddonQty>
																					)}
																			</AddonRow>
																		);
																	},
																)}
															</Stack>
														);
													},
												)}
											</Stack>
										</AddonBox>
									)}
							</Stack>
						</Wrapper>
					);
				})}
			</Stack>

			{data.deliveryAvailable && data.pickupAvailable && (
				<Row $gap={10}>
					<Toggle
						$active={fulfillment === "PICKUP"}
						onClick={() => setFulfillment("PICKUP")}
					>
						🥡 Pickup
					</Toggle>
					<Toggle
						$active={fulfillment === "DELIVERY"}
						onClick={() => setFulfillment("DELIVERY")}
					>
						🛵 Delivery
					</Toggle>
				</Row>
			)}

			{fulfillment === "DELIVERY" && (
				<Card>
					<Stack $gap={12}>
						<Text $weight={700}>Delivery details</Text>
						<Text $muted $size={13}>
							Delivery fulfilled by the vendor. Prechop manages
							payment and order status, but this kitchen arranges
							the rider or delivery method.
						</Text>
						{(data.deliveryCoverage ||
							data.deliveryEstimateMinutes ||
							data.deliveryContactPhone) && (
							<Stack $gap={4}>
								{data.deliveryCoverage && (
									<Text $muted $size={12}>
										Coverage: {data.deliveryCoverage}
									</Text>
								)}
								{data.deliveryEstimateMinutes && (
									<Text $muted $size={12}>
										Estimated delivery:{" "}
										{data.deliveryEstimateMinutes} minutes
									</Text>
								)}
								{data.deliveryContactPhone && (
									<Text $muted $size={12}>
										Vendor delivery contact:{" "}
										{data.deliveryContactPhone}
									</Text>
								)}
							</Stack>
						)}
						<Input
							label="Phone number"
							type="tel"
							value={deliveryPhone}
							onChange={(e) => setDeliveryPhone(e.target.value)}
							placeholder="+2348012345678"
						/>
						<Input
							label="Hostel / hall"
							value={hostel}
							onChange={(e) => setHostel(e.target.value)}
							placeholder="Kofo Hall"
						/>
						<Input
							label="Room number"
							value={room}
							onChange={(e) => setRoom(e.target.value)}
							placeholder="B12"
						/>
						<Textarea
							label="Extra directions (optional)"
							value={extra}
							onChange={(e) => setExtra(e.target.value)}
							placeholder="Call when you reach the gate"
						/>
					</Stack>
				</Card>
			)}

			<Card>
				<Stack $gap={8}>
					<Textarea
						label="Message for vendor (optional)"
						value={customerMessage}
						onChange={(e) =>
							setCustomerMessage(e.target.value.slice(0, 150))
						}
						maxLength={150}
						placeholder="I don't like much pepper, thanks"
					/>
					<Text $muted $size={12}>
						{customerMessage.length}/150 characters
					</Text>
				</Stack>
			</Card>

			{externalPayment && (
				<Card $accent>
					<Stack $gap={12}>
						<Stack $gap={4}>
							<Text $weight={800}>Pay for me link ready</Text>
							<Text $muted $size={13}>
								Send this secure link to someone who can pay for
								your order. It hides your private account
								details.
							</Text>
							{externalPayment.externalPaymentExpiresAt && (
								<Text $muted $size={12}>
									Expires{" "}
									{formatDate(
										externalPayment.externalPaymentExpiresAt,
									)}
								</Text>
							)}
						</Stack>
						<Row $gap={8} $wrap>
							<Button onClick={copyExternalLink}>
								Copy link
							</Button>
							<Button
								$variant="secondary"
								onClick={shareExternalOnWhatsApp}
							>
								Share on WhatsApp
							</Button>
							<Button
								$variant="ghost"
								$loading={placing}
								onClick={payExternalOrderNow}
							>
								Pay now instead
							</Button>
							<Button
								$variant="danger"
								$loading={placing}
								onClick={cancelExternalRequest}
							>
								Cancel request
							</Button>
						</Row>
					</Stack>
				</Card>
			)}

			<Sticky>
				<Stack $gap={10}>
					{itemCount > 0 && (
						<Stack $gap={4}>
							<FeeRow>
								<Text $muted>Subtotal</Text>
								<Text>{formatKobo(subtotal)}</Text>
							</FeeRow>
							{fulfillment === "DELIVERY" && (
								<FeeRow>
									<Text $muted>Delivery fee</Text>
									<Text>
										{deliveryFee === 0
											? "Free"
											: formatKobo(deliveryFee)}
									</Text>
								</FeeRow>
							)}
							<FeeRow>
								<Row $gap={6} $align="center">
									<Text $muted>Service fee</Text>
									<InfoButton
										type="button"
										aria-label={`Service fee information — ${feeExplainer}`}
										title={feeExplainer}
										onClick={() =>
											toast(feeExplainer, "info")
										}
									>
										i
									</InfoButton>
								</Row>
								<Text>
									{canQuoteFee
										? formatKobo(processingFee)
										: "—"}
								</Text>
							</FeeRow>
							<FeeRow>
								<Text $weight={800}>Total</Text>
								<Text $weight={800}>
									{canQuoteFee
										? formatKobo(checkoutTotal)
										: "—"}
								</Text>
							</FeeRow>
						</Stack>
					)}
					{itemCount > 0 && !externalPayment && (
						<Row $gap={10}>
							<Toggle
								$active={paymentMode === "SELF"}
								onClick={() => setPaymentMode("SELF")}
							>
								Pay now
							</Toggle>
							<Toggle
								$active={paymentMode === "PAY_FOR_ME"}
								onClick={() => setPaymentMode("PAY_FOR_ME")}
							>
								Pay for me
							</Toggle>
						</Row>
					)}
					<Button
						$full
						$size="lg"
						$loading={placing}
						onClick={checkout}
						disabled={
							(!!externalPayment || !canOrder) && isAuthenticated
						}
					>
						{!isAuthenticated
							? "Log in to order"
							: !orderable
								? // "Opens 11:30am" for a not-yet-started listing (visible but
									// not orderable); "Ordering closed" for every closed reason.
									status?.kind === "OPENS_AT"
									? status.label
									: "Ordering closed"
								: itemCount === 0
									? "Select items"
									: !optionsValid
										? "Complete required options"
										: // The buyer must never be sent to Paystack against a
											// total we could not compute. See the fee note at the top.
											!canQuoteFee
											? "Fees unavailable — try again"
											: `Pay ${formatKobo(checkoutTotal)} →`}
					</Button>
				</Stack>
			</Sticky>
		</Wrap>
	);
}

function errMsg(e: unknown): string {
	const err = e as { response?: { data?: { message?: string } } };
	return err?.response?.data?.message ?? "Something went wrong. Try again.";
}
