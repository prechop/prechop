"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type MouseEvent, useEffect, useRef, useState } from "react";
import styled from "styled-components";
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
	Select,
	Stack,
	Text,
} from "@/components";
import { PageLoader } from "@/components/Loader";
import { api, apiData } from "@/constants/api";
import { fetcher } from "@/constants/fetcher";
import { formatKobo } from "@/constants/formatters";
import {
	listingUrl,
	listingWhatsAppMessage,
	storeUrl,
	storeWhatsAppMessage,
} from "@/constants/shareLinks";
import { useToast } from "@/hooks/useToast";
import type { VendorMe } from "@/libs/VendorOnboardingWrapper";
import type { DailyOrder, MenuItem, MenuOptionGroup } from "@/types";
import ItemGroupsEditor, {
	type EditableOption,
	seedOptions,
} from "./ItemGroupsEditor";

interface TemplateEntry {
	menuItem: { id?: string; _id?: string } | null;
}
type FulfilmentChoice = "PICKUP" | "DELIVERY" | "BOTH";

function fulfilmentChoice(
	pickup: boolean,
	delivery: boolean,
): FulfilmentChoice {
	if (pickup && delivery) return "BOTH";
	if (delivery) return "DELIVERY";
	return "PICKUP";
}

// getDay() index → timetable DayOfWeek name.
const WEEKDAYS = [
	"SUNDAY",
	"MONDAY",
	"TUESDAY",
	"WEDNESDAY",
	"THURSDAY",
	"FRIDAY",
	"SATURDAY",
];
function weekdayOf(dateStr: string): string {
	return WEEKDAYS[new Date(`${dateStr}T00:00:00`).getDay()];
}

// Stable empty defaults so unedited items don't create new prop objects each render.
const EMPTY_SET: Set<string> = new Set();
const EMPTY_EDITS: Record<string, EditableOption[]> = {};

function menuItemPriceLabel(item: MenuItem): string {
	const activeVariantPrices = (item.variants ?? [])
		.filter((variant) => variant.isActive)
		.map((variant) => variant.priceKobo);
	if (activeVariantPrices.length === 0) return formatKobo(item.priceKobo);
	const min = Math.min(...activeVariantPrices);
	const max = Math.max(...activeVariantPrices);
	return min === max ? formatKobo(min) : `From ${formatKobo(min)}`;
}

const ItemRow = styled(Card)<{ $on: boolean }>`
  padding: var(--pc-space-3) var(--pc-space-4);
  cursor: pointer;
  border-color: ${(p) =>
		p.$on ? "var(--pc-color-primary)" : "var(--pc-border)"};
  background: ${(p) =>
		p.$on ? "var(--pc-color-primary-50)" : "var(--pc-surface)"};
  box-shadow: ${(p) =>
		p.$on ? "var(--pc-shadow-primary)" : "var(--pc-shadow-sm)"};
  &:hover {
    border-color: var(--pc-color-primary);
  }
`;
const Check = styled.span<{ $on: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  flex-shrink: 0;
  font-size: 15px;
  font-weight: 800;
  color: var(--pc-text-inverse);
  transition: all var(--pc-dur) var(--pc-ease);
  background: ${(p) =>
		p.$on ? "var(--pc-color-primary)" : "var(--pc-surface-2)"};
  border: 1.5px solid
    ${(p) => (p.$on ? "var(--pc-color-primary)" : "var(--pc-border)")};
`;
const ConfirmLabel = styled.label`
	display: flex;
	gap: var(--pc-space-3);
	align-items: flex-start;
	padding: var(--pc-space-3);
	border: 1px solid var(--pc-border);
	border-radius: var(--pc-radius-sm);
	background: var(--pc-surface-2);
	color: var(--pc-text);
	font-size: 13px;
	line-height: 1.45;

	input {
		margin-top: 3px;
		width: 18px;
		height: 18px;
		accent-color: var(--pc-color-primary);
		flex-shrink: 0;
	}
`;
const ItemsHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--pc-space-3);
  flex-wrap: wrap;

  @media (max-width: 520px) {
    align-items: stretch;
  }
`;
const ItemsTitle = styled.div`
  display: flex;
  align-items: center;
  gap: var(--pc-space-2);
  min-width: 0;
  flex: 1 1 180px;
  font-family: var(--pc-font-display);
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--pc-text);
`;
const ItemsAction = styled.div`
  flex: 0 1 auto;

  @media (max-width: 520px) {
    flex-basis: 100%;

    button {
      width: 100%;
      white-space: normal;
    }
  }
`;
const QtyWrap = styled.div`
  padding-left: 36px;
`;
const VariantReview = styled.div`
	margin-left: 36px;
	padding: 10px 12px;
	border: 1px solid var(--pc-border);
	border-radius: var(--pc-radius-sm);
	background: var(--pc-surface-2);
`;
const VariantReviewRow = styled.div`
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	padding: 7px 0;
	border-bottom: 1px solid var(--pc-border);
	&:last-child { border-bottom: 0; }
`;
const VariantMeta = styled.div`
	display: flex;
	align-items: center;
	justify-content: flex-end;
	gap: 6px;
	flex-wrap: wrap;
`;
const SubmitBar = styled.div`
  position: sticky;
  bottom: var(--pc-space-3);
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--pc-space-4);
  flex-wrap: wrap;
  padding: var(--pc-space-3) var(--pc-space-4);
  background: var(--pc-surface);
  border: 1px solid var(--pc-border);
  border-radius: var(--pc-radius);
  box-shadow: var(--pc-shadow-lg);
`;
const SubmitAction = styled.div`
  flex: 1;
  min-width: 200px;
`;

const BatchCard = styled.div<{ $active?: boolean }>`
  padding: var(--pc-space-3) var(--pc-space-4);
  border-radius: var(--pc-radius);
  border: 1px solid ${(p) => (p.$active ? "var(--pc-color-primary)" : "var(--pc-border)")};
  background: ${(p) => (p.$active ? "var(--pc-color-primary-50)" : "var(--pc-surface)")};
  cursor: pointer;
  transition: all var(--pc-dur) var(--pc-ease);
`;

/* ── Post-publish share screen (#9) ─────────────────────────────────────── */
const SuccessHero = styled(Card)`
  text-align: center;
  background: var(--pc-gradient-calm-orange);
  border: none;
  color: #fff;
  box-shadow: var(--pc-shadow-calm-orange);
`;
const Medallion = styled.div`
  width: 74px;
  height: 74px;
  margin: 0 auto var(--pc-space-3);
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);
  font-size: 36px;
`;
const LinkBox = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1.5px solid var(--pc-border);
  border-radius: var(--pc-radius-sm);
  background: var(--pc-surface-2);
`;
const LinkText = styled.span`
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--pc-text-muted);
`;
const ShareGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
`;
const ShareBtn = styled.a<{ $bg: string }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 5px;
  border-radius: var(--pc-radius-sm);
  font-weight: 700;
  font-size: 14.5px;
  color: #fff;
  background: ${(p) => p.$bg};
  transition: filter var(--pc-dur) var(--pc-ease);
  &:hover {
    filter: brightness(1.06);
  }
`;

function errMsg(e: unknown): string {
	const m = (e as { response?: { data?: { message?: string } } })?.response
		?.data?.message;
	return m ?? "Something went wrong. Please try again.";
}

function pad(n: number): string {
	return String(n).padStart(2, "0");
}
function defaultDate(): string {
	const d = new Date();
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function nowLocal(): string {
	const d = new Date();
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
		d.getHours(),
	)}:${pad(d.getMinutes())}`;
}
function defaultCutoff(): string {
	const d = new Date(Date.now() + 3 * 60 * 60 * 1000);
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
		d.getHours(),
	)}:${pad(d.getMinutes())}`;
}
// ISO → the local `YYYY-MM-DD` / `YYYY-MM-DDTHH:mm` shapes the date inputs need,
// used to hydrate the form when editing an existing listing.
function isoToDate(iso: string): string {
	const d = new Date(iso);
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function isoToLocal(iso: string): string {
	const d = new Date(iso);
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
		d.getHours(),
	)}:${pad(d.getMinutes())}`;
}

interface Published {
	order: DailyOrder;
	storeSlug?: string;
}

export default function DailyOrderComposerWrapper({
	orderId,
}: {
	orderId?: string;
} = {}) {
	const router = useRouter();
	const { toast } = useToast();
	const isEdit = !!orderId;
	const { data: menu, isLoading } = useSWR<MenuItem[]>("/menu", fetcher);
	const { data: groupsData } = useSWR<MenuOptionGroup[]>(
		"/menu/option-groups",
		fetcher,
	);
	const { data: vendor } = useSWR<VendorMe>("/vendors/me", fetcher);
	const { data: featureSettings } = useSWR<{
		scheduleAhead: boolean;
		weeklyBreakfastPlan: boolean;
		delivery: boolean;
		pickup: boolean;
		breakfastEnabled: boolean;
		lunchEnabled: boolean;
		dinnerEnabled: boolean;
	}>("/vendors/me/feature-settings", fetcher);
	// Edit mode: load the listing being edited so the form can hydrate from it.
	const { data: editing, isLoading: editingLoading } = useSWR<DailyOrder>(
		orderId ? `/daily-orders/my-orders/${orderId}` : null,
		fetcher,
	);

	const [title, setTitle] = useState("");
	const [scheduledDate, setScheduledDate] = useState(defaultDate());
	const [availableFrom, setAvailableFrom] = useState(nowLocal());
	const [cutoff, setCutoff] = useState(defaultCutoff());

	// Timetable for the SELECTED date's weekday — pre-fills the item selection
	// so the listing schedules that timetable day (#8, timetable-linked).
	const { data: template } = useSWR<TemplateEntry[]>(
		`/timetable/template?dayOfWeek=${weekdayOf(scheduledDate)}`,
		fetcher,
	);
	const [pickup, setPickup] = useState(true);
	const [delivery, setDelivery] = useState(false);
	const [deliveryFee, setDeliveryFee] = useState("");
	const [deliveryCoverage, setDeliveryCoverage] = useState("");
	const [deliveryEstimate, setDeliveryEstimate] = useState("");
	const [deliveryContact, setDeliveryContact] = useState("");
	const [deliveryAccepted, setDeliveryAccepted] = useState(false);
	const [selected, setSelected] = useState<Record<string, string>>({});
	// Per-listing exclusions: menuItemId → set of attached group ids turned off
	// for this listing. Empty/absent means all attached groups are included.
	const [excludedGroups, setExcludedGroups] = useState<
		Record<string, Set<string>>
	>({});
	// Per-listing option overrides: menuItemId → groupId → edited option rows.
	// Absent means "use the menu library's options for that group as-is".
	const [optionEdits, setOptionEdits] = useState<
		Record<string, Record<string, EditableOption[]>>
	>({});
	const [busy, setBusy] = useState(false);
	const [published, setPublished] = useState<Published | null>(null);
	const [copied, setCopied] = useState(false);
	const [storeCopied, setStoreCopied] = useState(false);
	const [modeTab, setModeTab] = useState<"BREAKFAST" | "LUNCH" | "DINNER" | "SCHEDULE_AHEAD">(
		"SCHEDULE_AHEAD",
	);

	const breakfastEnabled = featureSettings?.breakfastEnabled ?? true;
	const lunchEnabled = featureSettings?.lunchEnabled ?? true;
	const dinnerEnabled = featureSettings?.dinnerEnabled ?? true;

	const enabledMealTabs = [
		breakfastEnabled && "BREAKFAST",
		lunchEnabled && "LUNCH",
		dinnerEnabled && "DINNER",
	].filter(Boolean) as Array<"BREAKFAST" | "LUNCH" | "DINNER">;

	useEffect(() => {
		if (
			!enabledMealTabs.includes(modeTab as "BREAKFAST" | "LUNCH" | "DINNER") &&
			modeTab !== "SCHEDULE_AHEAD" &&
			!isEdit
		) {
			setModeTab("SCHEDULE_AHEAD");
		}
	}, [enabledMealTabs, modeTab, isEdit]);
	const [selectedBatch, setSelectedBatch] = useState<{
		windowId: string;
		batchId?: string;
	} | null>(null);
	const { data: batchesData } = useSWR<{ batches: Array<{
		window: { _id: string; mealTime: string; name?: string; orderWindowStart: string; orderWindowEnd: string; deliveryWindowStart: string; deliveryWindowEnd: string; capacity: number };
		batch: { _id?: string } | null;
		capacity: { reservedQuantity: number; remainingQuantity: number };
		status: "open" | "paused" | "closed" | "full";
		paused: boolean;
	}> }>(
		modeTab !== "SCHEDULE_AHEAD"
			? `/daily-orders/today-batches?mealTime=${modeTab}&all=true`
			: null,
		fetcher,
	);

	// Seed fulfilment toggles from the vendor's saved delivery defaults, once.
	// Skipped when editing — there the existing listing's values win.
	const seededDefaults = useRef(false);
	useEffect(() => {
		if (isEdit || !vendor || seededDefaults.current) return;
		seededDefaults.current = true;
		setPickup(vendor.defaultPickupAvailable ?? true);
		setDelivery(vendor.defaultDeliveryAvailable ?? false);
		if (vendor.defaultDeliveryFeeKobo)
			setDeliveryFee(String(vendor.defaultDeliveryFeeKobo / 100));
		setDeliveryCoverage(vendor.defaultDeliveryCoverage ?? "");
		setDeliveryEstimate(
			vendor.defaultDeliveryEstimateMinutes
				? String(vendor.defaultDeliveryEstimateMinutes)
				: "",
		);
		setDeliveryContact(vendor.defaultDeliveryContactPhone ?? "");
		setDeliveryAccepted(
			vendor.defaultDeliveryResponsibilityAccepted ?? false,
		);
	}, [isEdit, vendor]);

	// Auto-select first available batch when today's batches load.
	const batched = useRef(false);
	const prevModeTab = useRef(modeTab);
	useEffect(() => {
		batched.current = false;
		if (
			prevModeTab.current === "SCHEDULE_AHEAD" &&
			modeTab !== "SCHEDULE_AHEAD"
		) {
			setScheduledDate(defaultDate());
			setSelectedBatch(null);
		}
		if (
			prevModeTab.current !== "SCHEDULE_AHEAD" &&
			modeTab === "SCHEDULE_AHEAD"
		) {
			setSelectedBatch(null);
			setAvailableFrom(nowLocal());
			setCutoff(defaultCutoff());
		}
		prevModeTab.current = modeTab;
	}, [modeTab]);
	useEffect(() => {
		if (batched.current || !batchesData?.batches?.length) return;
		const available = batchesData.batches.find(
			(b) => b.status === "open" && b.capacity.remainingQuantity > 0,
		);
		if (available) {
			setSelectedBatch({
				windowId: available.window._id,
				batchId: available.batch?._id,
			});
		}
		batched.current = true;
	}, [batchesData]);

	// Sync availableFrom/cutoff with the selected batch window in batch mode.
	useEffect(() => {
		if (
			modeTab === "SCHEDULE_AHEAD" ||
			!selectedBatch ||
			!batchesData?.batches
		)
			return;
		const batch = batchesData.batches.find(
			(b) => b.window._id === selectedBatch.windowId,
		);
		if (!batch) return;
		const today = defaultDate();
		const isOvernight =
			batch.window.orderWindowEnd <= batch.window.orderWindowStart;
		const year = Number(today.slice(0, 4));
		const month = Number(today.slice(5, 7)) - 1;
		const day = Number(today.slice(8, 10));
		const base = new Date(year, month, day);
		const endDate = isOvernight
			? new Date(base.getTime() + 86400000)
			: base;
		const endDateStr = `${endDate.getFullYear()}-${pad(endDate.getMonth() + 1)}-${pad(endDate.getDate())}`;
		setAvailableFrom(`${today}T${batch.window.orderWindowStart}`);
		setCutoff(`${endDateStr}T${batch.window.orderWindowEnd}`);
	}, [selectedBatch, modeTab, batchesData]);

	// Hydrate the whole form from the listing being edited, once.
	const hydrated = useRef(false);
	useEffect(() => {
		if (!isEdit || !editing || hydrated.current) return;
		hydrated.current = true;
		setTitle(editing.title);
		setScheduledDate(isoToDate(editing.scheduledDate));
		if (editing.availableFrom)
			setAvailableFrom(isoToLocal(editing.availableFrom));
		setCutoff(isoToLocal(editing.cutoffTime));
		setPickup(editing.pickupAvailable);
		setDelivery(editing.deliveryAvailable);
		if (editing.deliveryFeeKobo)
			setDeliveryFee(String(editing.deliveryFeeKobo / 100));
		setDeliveryCoverage(editing.deliveryCoverage ?? "");
		setDeliveryEstimate(
			editing.deliveryEstimateMinutes
				? String(editing.deliveryEstimateMinutes)
				: "",
		);
		setDeliveryContact(editing.deliveryContactPhone ?? "");
		setDeliveryAccepted(editing.deliveryResponsibilityAccepted ?? false);
		const sel: Record<string, string> = {};
		const edits: Record<string, Record<string, EditableOption[]>> = {};
		for (const it of editing.items) {
			sel[it.menuItemId] = it.maxQuantity ? String(it.maxQuantity) : "";
			for (const g of it.optionGroups ?? []) {
				if (!g.sourceGroupId) continue;
				edits[it.menuItemId] ??= {};
				edits[it.menuItemId][g.sourceGroupId] = g.options.map((o) => ({
					name: o.name,
					priceNaira: String((o.priceKobo ?? 0) / 100),
				}));
			}
		}
		setSelected(sel);
		setOptionEdits(edits);
	}, [isEdit, editing]);

	// Re-derive per-listing group exclusions from the edited snapshot once both
	// the listing and the menu (for each item's attached groups) are loaded.
	const hydratedExclusions = useRef(false);
	useEffect(() => {
		if (!isEdit || !editing || !menu || hydratedExclusions.current) return;
		hydratedExclusions.current = true;
		const byId = new Map(menu.map((m) => [m.id, m]));
		const ex: Record<string, Set<string>> = {};
		for (const it of editing.items) {
			const mi = byId.get(it.menuItemId);
			if (!mi) continue;
			const included = new Set(
				(it.optionGroups ?? [])
					.map((g) => g.sourceGroupId)
					.filter((x): x is string => Boolean(x)),
			);
			const excludedSet = new Set<string>();
			for (const gid of mi.optionGroupIds ?? [])
				if (!included.has(gid)) excludedSet.add(gid);
			if (excludedSet.size > 0) ex[it.menuItemId] = excludedSet;
		}
		if (Object.keys(ex).length > 0) setExcludedGroups(ex);
	}, [isEdit, editing, menu]);

	// Pre-fill the item selection from today's timetable, once, if the vendor
	// hasn't picked anything yet. Skipped when editing.
	const seededItems = useRef(false);
	useEffect(() => {
		if (isEdit || !template || seededItems.current) return;
		seededItems.current = true;
		const ids = template
			.map((e) => e.menuItem?.id ?? e.menuItem?._id)
			.filter((x): x is string => !!x);
		if (ids.length === 0) return;
		setSelected((s) => {
			if (Object.keys(s).length > 0) return s;
			const next: Record<string, string> = {};
			for (const id of ids) next[id] = "";
			return next;
		});
		setTitle((t) => t || `${weekdayOf(scheduledDate)} specials`);
	}, [template, isEdit, scheduledDate]);

	if (isLoading || (isEdit && editingLoading)) return <PageLoader />;

	// A listing can only be edited before it opens for orders. Mirror the server
	// lock (`assertActiveVendor` + the availableFrom window) so an already-open
	// or closed listing shows a clear message instead of a form that would 409.
	const editLocked =
		isEdit &&
		!!editing &&
		(editing.status === "CLOSED" || editing.status === "CANCELLED");
	if (editLocked) {
		return (
			<FadeIn>
				<Stack $gap={20}>
					<PageHeader
						eyebrow="Vendor · Kitchen"
						title="Edit daily order"
						subtitle="This listing can no longer be changed."
					/>
					<EmptyState
						icon="🔒"
						title="Editing is closed"
						description="Closed and cancelled listings can’t be edited."
						action={
							<Button onClick={() => router.push("/dashboard")}>
								Back to dashboard
							</Button>
						}
					/>
				</Stack>
			</FadeIn>
		);
	}

	const menuItems = (menu ?? [])
		.filter((m) => m.isAvailable)
		.filter((m) => {
			if (modeTab === "SCHEDULE_AHEAD") return true;
			return (m.mealTimes ?? []).includes(modeTab);
		});
	const groupById = new Map((groupsData ?? []).map((g) => [g.id, g]));

	/** Library option groups attached to a menu item, in attach order. */
	function attachedGroups(item: MenuItem): MenuOptionGroup[] {
		return (item.optionGroupIds ?? [])
			.map((id) => groupById.get(id))
			.filter((g): g is MenuOptionGroup => Boolean(g));
	}

	/** Variants frozen on an edited listing win over later menu changes. */
	function inheritedVariants(item: MenuItem) {
		const listingVariants = isEdit
			? editing?.items.find((entry) => entry.menuItemId === item.id)
					?.snapshotVariants
			: undefined;
		return [...(listingVariants ?? item.variants ?? [])].sort(
			(a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0),
		);
	}

	function toggleGroupForItem(itemId: string, groupId: string) {
		setExcludedGroups((prev) => {
			const cur = new Set(prev[itemId] ?? []);
			if (cur.has(groupId)) cur.delete(groupId);
			else cur.add(groupId);
			return { ...prev, [itemId]: cur };
		});
	}

	function setGroupOptions(
		itemId: string,
		groupId: string,
		options: EditableOption[],
	) {
		setOptionEdits((prev) => ({
			...prev,
			[itemId]: { ...(prev[itemId] ?? {}), [groupId]: options },
		}));
	}

	function toggle(id: string) {
		setSelected((s) => {
			if (id in s) {
				const next = { ...s };
				delete next[id];
				return next;
			}
			return { ...s, [id]: "" };
		});
	}

	async function seedFromTemplate() {
		try {
			const entries = await apiData<TemplateEntry[]>(
				api.get(
					`/timetable/template?dayOfWeek=${weekdayOf(scheduledDate)}`,
				),
			);
			const ids = entries
				.map((e) => e.menuItem?.id ?? e.menuItem?._id)
				.filter((x): x is string => !!x);
			if (ids.length === 0) {
				toast("Nothing scheduled for today in your timetable", "info");
				return;
			}
			setSelected((s) => {
				const next = { ...s };
				for (const id of ids) if (!(id in next)) next[id] = "";
				return next;
			});
			toast(
				`Added ${ids.length} item(s) from today's timetable`,
				"success",
			);
		} catch (e) {
			toast(errMsg(e), "error");
		}
	}

	async function submit() {
		const ids = Object.keys(selected);
		if (!title.trim()) {
			toast("Give your daily order a title", "error");
			return;
		}
		if (ids.length === 0) {
			toast("Select at least one menu item", "error");
			return;
		}
		// Guard against past dates/cutoffs (the inputs also enforce `min`).
		if (scheduledDate < defaultDate()) {
			toast("Pick today or a future date", "error");
			return;
		}
		if (new Date(cutoff).getTime() <= Date.now()) {
			toast("Orders must close in the future", "error");
			return;
		}
		if (new Date(availableFrom).getTime() >= new Date(cutoff).getTime()) {
			toast("Orders must open before they close", "error");
			return;
		}
		// Build each item's option groups from the (possibly edited) attached
		// library groups, dropping any the vendor excluded for this listing and
		// validating that each kept group still has enough named options.
		const items: Array<{
			menuItemId: string;
			maxQuantity?: number;
			optionGroups?: Array<{
				sourceGroupId: string;
				name: string;
				required: boolean;
				minSelect: number;
				maxSelect: number | null;
				options: Array<{ name: string; priceNaira: number }>;
			}>;
		}> = [];
		for (const id of ids) {
			const q = Number(selected[id]);
			const item = menuItems.find((m) => m.id === id);
			const excluded = excludedGroups[id] ?? EMPTY_SET;
			const optionGroups = [];
			for (const g of item ? attachedGroups(item) : []) {
				if (excluded.has(g.id)) continue;
				const edited = optionEdits[id]?.[g.id] ?? seedOptions(g);
				const options = edited
					.map((o) => ({
						name: o.name.trim(),
						priceNaira: Number(o.priceNaira) || 0,
					}))
					.filter((o) => o.name.length > 0);
				const min = g.required ? Math.max(1, g.minSelect) : g.minSelect;
				const need = Math.max(1, min);
				if (options.length < need) {
					toast(
						`"${g.name}" needs at least ${need} option${need === 1 ? "" : "s"} with a name.`,
						"error",
					);
					return;
				}
				optionGroups.push({
					sourceGroupId: g.id,
					name: g.name,
					required: g.required,
					minSelect: g.minSelect,
					maxSelect: g.maxSelect,
					options,
				});
			}
			items.push({
				menuItemId: id,
				...(q > 0 ? { maxQuantity: Math.floor(q) } : {}),
				...(optionGroups.length > 0 ? { optionGroups } : {}),
			});
		}
		if (!pickup && !delivery) {
			toast("Choose pickup, delivery, or both.", "error");
			return;
		}
		if (delivery) {
			if (deliveryFee.trim() === "" || Number(deliveryFee) < 0) {
				toast(
					"Add a valid delivery fee. Use 0 for free delivery.",
					"error",
				);
				return;
			}
			if (!deliveryCoverage.trim()) {
				toast("Add the supported delivery areas or distance.", "error");
				return;
			}
			if (
				!Number.isFinite(Number(deliveryEstimate)) ||
				Number(deliveryEstimate) <= 0
			) {
				toast("Add a realistic delivery estimate in minutes.", "error");
				return;
			}
			if (!deliveryContact.trim()) {
				toast("Add a delivery contact number.", "error");
				return;
			}
			if (!deliveryAccepted) {
				toast(
					"Confirm that you manage and complete delivery.",
					"error",
				);
				return;
			}
		}
		const isToday =
			scheduledDate ===
			defaultDate();
		const isScheduleAhead = modeTab === "SCHEDULE_AHEAD";
		if (isToday && !isScheduleAhead && !selectedBatch && !isEdit) {
			toast(
				"Select a delivery window batch for today's order.",
				"error",
			);
			return;
		}
		if (isToday && !isScheduleAhead && selectedBatch && batchesData?.batches) {
			const selected = batchesData.batches.find(
				(b) => b.window._id === selectedBatch.windowId,
			);
			if (selected && selected.status !== "open") {
				const messages: Record<string, string> = {
					paused: "This batch is paused for today.",
					closed: "This order window has ended.",
					full: "This batch is fully booked.",
				};
				toast(
					messages[selected.status] ??
						"This batch is not available.",
					"error",
				);
				return;
			}
		}
		setBusy(true);
		try {
		const isToday =
			scheduledDate ===
			defaultDate();

		const body: Record<string, unknown> = {
			title: title.trim(),
			scheduledDate: new Date(scheduledDate).toISOString(),
			availableFrom: new Date(availableFrom).toISOString(),
			cutoffTime: new Date(cutoff).toISOString(),
			pickupAvailable: pickup,
			deliveryAvailable: delivery,
			deliveryFeeKobo: delivery
				? Math.round(Number(deliveryFee) * 100)
				: 0,
			deliveryCoverage: delivery
				? deliveryCoverage.trim()
				: undefined,
			deliveryEstimateMinutes: delivery
				? Math.round(Number(deliveryEstimate))
				: undefined,
			deliveryContactPhone: delivery
				? deliveryContact.trim()
				: undefined,
			deliveryResponsibilityAccepted: delivery
				? deliveryAccepted
				: false,
			items,
		};

		const isScheduleAhead = modeTab === "SCHEDULE_AHEAD";

		if (isToday && !isScheduleAhead) {
			body.mode = "A";
			body.mealTime = modeTab;
			body.deliveryWindowId = selectedBatch?.windowId;
			body.batchId = selectedBatch?.batchId;
		} else {
			body.mode = "B";
		}

		if (isEdit) {
			await api.patch(`/daily-orders/${orderId}`, body);
			toast("Changes saved", "success");
			router.push("/dashboard");
			return;
		}

		const order = await apiData<DailyOrder>(
			api.post("/daily-orders", { ...body, draft: false }),
		);
			toast("Daily order posted", "success");
			let storeSlug = vendor?.storeSlug;
			if (!storeSlug) {
				try {
					const storeVendor = await apiData<VendorMe>(
						api.post("/vendors/me/store-slug", {}),
					);
					storeSlug = storeVendor.storeSlug;
				} catch {
					// The listing is already live; store-link setup can be retried from Store.
				}
			}
			setPublished({ order, storeSlug });
		} catch (e) {
			toast(errMsg(e), "error");
		} finally {
			setBusy(false);
		}
	}

	if (published) {
		const { order, storeSlug } = published;
		const shareUrl = listingUrl(order.shareableToken);
		const prices = order.items.flatMap((item) => {
			const variants = (item.snapshotVariants ?? []).filter(
				(variant) => variant.isActive !== false,
			);
			return variants.length > 0
				? variants.map((variant) => variant.priceKobo)
				: [item.snapshotPriceKobo];
		});
		const minPrice = Math.min(...prices);
		const maxPrice = Math.max(...prices);
		const priceLabel =
			prices.length > 1 && minPrice !== maxPrice
				? `From ${formatKobo(minPrice)}`
				: formatKobo(minPrice);
		const allFinite = order.items.every((item) => item.maxQuantity != null);
		const remainingQuantity = allFinite
			? order.items.reduce(
					(total, item) =>
						total +
						(item.remainingQuantity ??
							Math.max(
								(item.maxQuantity ?? 0) - item.orderedQuantity,
								0,
							)),
					0,
				)
			: undefined;
		const businessName = vendor?.businessName ?? "My kitchen";
		const shareText = listingWhatsAppMessage({
			businessName,
			title: order.title,
			priceLabel,
			remainingQuantity,
			cutoffTime: order.cutoffTime,
			shareableToken: order.shareableToken,
		});
		const waHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
		const instagramHref = "https://www.instagram.com/";
		const publicStoreUrl = storeSlug ? storeUrl(storeSlug) : "";
		const storeShareText = storeSlug
			? storeWhatsAppMessage(businessName, storeSlug)
			: "";
		const storeWaHref = storeSlug
			? `https://wa.me/?text=${encodeURIComponent(storeShareText)}`
			: "";

		const copyLink = async () => {
			try {
				await navigator.clipboard.writeText(shareUrl);
				setCopied(true);
				toast("Link copied", "success");
				setTimeout(() => setCopied(false), 2000);
			} catch {
				toast(
					"Couldn't copy — long-press the link to copy it",
					"error",
				);
			}
		};
		const copyStoreLink = async () => {
			if (!publicStoreUrl) return;
			try {
				await navigator.clipboard.writeText(publicStoreUrl);
				setStoreCopied(true);
				toast("Store link copied", "success");
				setTimeout(() => setStoreCopied(false), 2000);
			} catch {
				toast("Couldn't copy the store link", "error");
			}
		};
		const shareToInstagram = async (
			event: MouseEvent<HTMLAnchorElement>,
			text: string,
		) => {
			event.preventDefault();
			try {
				await navigator.clipboard.writeText(text);
				toast("Share text copied for Instagram", "success");
			} catch {
				toast("Open Instagram, then paste the share text", "info");
			}
			window.open(instagramHref, "_blank", "noopener,noreferrer");
		};

		return (
			<FadeIn>
				<Stack $gap={20}>
					<SuccessHero>
						<Medallion aria-hidden>🎉</Medallion>
						<Stack $gap={6}>
							<Text
								$weight={800}
								$size={22}
								style={{ color: "#fff" }}
							>
								You're live!
							</Text>
							<Text
								$size={14}
								style={{ color: "rgba(255,255,255,0.9)" }}
							>
								“{order.title}” is open for orders. Share the
								link so buyers can order.
							</Text>
						</Stack>
					</SuccessHero>

					<Card>
						<Stack $gap={14}>
							<SectionHeader title="Share this menu" icon="🔗" />
							<LinkBox>
								<LinkText>{shareUrl}</LinkText>
								<Button
									$size="sm"
									$variant={copied ? "secondary" : "primary"}
									onClick={copyLink}
								>
									{copied ? "Copied ✓" : "Copy menu link"}
								</Button>
							</LinkBox>
							<ShareGrid>
								<ShareBtn
									href={waHref}
									target="_blank"
									rel="noopener noreferrer"
									$bg="#25D366"
								>
									<span aria-hidden>💬</span> Share menu to
									WhatsApp
								</ShareBtn>
								<ShareBtn
									href={instagramHref}
									target="_blank"
									rel="noopener noreferrer"
									onClick={(event) =>
										shareToInstagram(event, shareText)
									}
									$bg="#922135"
								>
									<span aria-hidden>📸</span> Share menu to
									Instagram
								</ShareBtn>
							</ShareGrid>
						</Stack>
					</Card>

					{storeSlug && (
						<Card>
							<Stack $gap={14}>
								<SectionHeader
									title="Share my kitchen"
									icon="🏪"
								/>
								<Text $muted $size={13}>
									Your permanent store link stays the same
									after this menu closes.
								</Text>
								<LinkBox>
									<LinkText>{publicStoreUrl}</LinkText>
									<Button
										$size="sm"
										$variant="secondary"
										onClick={copyStoreLink}
									>
										{storeCopied
											? "Copied ✓"
											: "Copy store link"}
									</Button>
								</LinkBox>
								<ShareGrid>
									<ShareBtn
										href={storeWaHref}
										target="_blank"
										rel="noopener noreferrer"
										$bg="#166534"
									>
										<span aria-hidden>💬</span> Share store
										to WhatsApp
									</ShareBtn>
									<ShareBtn
										href={instagramHref}
										target="_blank"
										rel="noopener noreferrer"
										onClick={(event) =>
											shareToInstagram(
												event,
												storeShareText,
											)
										}
										$bg="#922135"
									>
										<span aria-hidden>📸</span> Share store
										to Instagram
									</ShareBtn>
								</ShareGrid>
							</Stack>
						</Card>
					)}

					<Row $gap={12} $wrap>
						<div style={{ flex: 1, minWidth: 160 }}>
							<Button
								as={Link}
								href={`/o/${order.shareableToken}`}
								target="_blank"
								$variant="secondary"
								$full
							>
								View listing
							</Button>
						</div>
						<div style={{ flex: 1, minWidth: 160 }}>
							<Button
								$full
								onClick={() => router.push("/dashboard")}
							>
								Back to dashboard
							</Button>
						</div>
					</Row>
				</Stack>
			</FadeIn>
		);
	}

	if (menuItems.length === 0) {
		return (
			<FadeIn>
				<Stack $gap={20}>
					<PageHeader
						eyebrow="Vendor · Kitchen"
						title="New daily order"
						subtitle="Compose today's menu and open it for orders."
					/>
					<EmptyState
						icon="🍽️"
						title="No available menu items"
						description="Add and enable menu items before composing a daily order."
						action={
							<Button onClick={() => router.push("/menu")}>
								Go to menu
							</Button>
						}
					/>
				</Stack>
			</FadeIn>
		);
	}

	const selectedCount = Object.keys(selected).length;
	const currentLocal = nowLocal();
	const closeMin =
		availableFrom && availableFrom > currentLocal
			? availableFrom
			: currentLocal;

	return (
		<FadeIn>
			<Stack $gap={20}>
				<PageHeader
					eyebrow="Vendor · Kitchen"
					title={isEdit ? "Edit daily order" : "New daily order"}
					subtitle={
						isEdit
							? "Update this listing. You can edit it until orders open."
							: "Pick today's dishes, set availability, and open the kitchen for orders."
					}
				/>

				<Card>
					<Stack $gap={12}>
						<Text $weight={700} $size={13}>
							Mode
						</Text>
						<Row $gap={8} $wrap>
							{enabledMealTabs.map((tab) => {
								const label =
									tab.charAt(0) + tab.slice(1).toLowerCase();
								return (
									<Button
										key={tab}
										$size="sm"
										$variant={
											modeTab === tab
												? "primary"
												: "secondary"
										}
										onClick={() =>
											setModeTab(tab)
										}
									>
										{label}
									</Button>
								);
							})}
							<Button
								$size="sm"
								$variant={
									modeTab === "SCHEDULE_AHEAD"
										? "primary"
										: "secondary"
								}
								onClick={() =>
									setModeTab("SCHEDULE_AHEAD")
								}
							>
								Schedule ahead
							</Button>
						</Row>
					</Stack>
				</Card>

					<Card>
						<Stack $gap={16}>
							<SectionHeader title="Details" icon="📝" />
							<Input
								label="Title"
								value={title}
								onChange={(e) => setTitle(e.target.value)}
								placeholder={
									modeTab === "SCHEDULE_AHEAD"
										? "Friday lunch specials"
										: `${modeTab === "BREAKFAST" ? "Breakfast" : modeTab === "LUNCH" ? "Lunch" : "Dinner"} specials`
								}
							/>
							{modeTab === "SCHEDULE_AHEAD" && (
								<div style={{ maxWidth: 240 }}>
									<Input
										label="Menu date"
										type="date"
										min={defaultDate()}
										value={scheduledDate}
										onChange={(e) =>
											setScheduledDate(e.target.value)
										}
									/>
								</div>
							)}
							{modeTab === "SCHEDULE_AHEAD" && (
								<Row $gap={12} $wrap>
									<div style={{ flex: 1, minWidth: 160 }}>
										<Input
											label="Orders open (start)"
											type="datetime-local"
											min={currentLocal}
											value={availableFrom}
											onChange={(e) =>
												setAvailableFrom(e.target.value)
											}
										/>
									</div>
									<div style={{ flex: 1, minWidth: 160 }}>
										<Input
											label="Orders close (end)"
											type="datetime-local"
											min={closeMin}
											value={cutoff}
											onChange={(e) => setCutoff(e.target.value)}
										/>
									</div>
								</Row>
							)}
							{modeTab === "SCHEDULE_AHEAD" && (
								<Text $muted $size={12}>
									Before it opens, buyers see this listing as "coming
									soon". After it closes it's pulled from the main
									page.
								</Text>
							)}

							<Stack $gap={10}>
								<Text $muted $size={13}>
									Vendor-managed delivery. Prechop does not
									currently provide riders or vehicles. If you
									enable delivery, you arrange the delivery
									method, fee, coverage, timing, and completion.
								</Text>
								<Select
									label="Fulfilment"
									value={fulfilmentChoice(pickup, delivery)}
									onChange={(e) => {
										const value = e.target
											.value as FulfilmentChoice;
										setPickup(
											value === "PICKUP" || value === "BOTH",
										);
										setDelivery(
											value === "DELIVERY" ||
												value === "BOTH",
										);
									}}
								>
									<option value="PICKUP">Pickup only</option>
									<option value="DELIVERY">Delivery only</option>
									<option value="BOTH">
										Pickup and delivery
									</option>
								</Select>
							{delivery && (
								<Stack $gap={10}>
									<Input
										label="Delivery fee (₦)"
										type="number"
										inputMode="decimal"
										value={deliveryFee}
										onChange={(e) =>
											setDeliveryFee(e.target.value)
										}
										placeholder="200"
									/>
									<Text $muted $size={12}>
										Enter 0 for free delivery.
									</Text>
									<Input
										label="Supported delivery areas or distance"
										value={deliveryCoverage}
										onChange={(e) =>
											setDeliveryCoverage(e.target.value)
										}
										placeholder="Within UI campus, halls and nearby hostels"
									/>
									<Input
										label="Estimated delivery time (minutes)"
										type="number"
										inputMode="numeric"
										value={deliveryEstimate}
										onChange={(e) =>
											setDeliveryEstimate(e.target.value)
										}
										placeholder="25"
									/>
									<Input
										label="Delivery contact number"
										type="tel"
										value={deliveryContact}
										onChange={(e) =>
											setDeliveryContact(e.target.value)
										}
										placeholder="+2348012345678"
									/>
									<ConfirmLabel>
										<input
											type="checkbox"
											checked={deliveryAccepted}
											onChange={(e) =>
												setDeliveryAccepted(
													e.target.checked,
												)
											}
										/>
										<span>
											I understand that I am responsible
											for arranging and completing
											delivery for this order.
										</span>
									</ConfirmLabel>
								</Stack>
							)}
						</Stack>
					</Stack>

				{batchesData?.batches?.length ? (
					<Stack $gap={10}>
						<Text $weight={700} $size={13}>
							<span aria-hidden>🏷️</span> Today's batches
						</Text>
						<Text $muted $size={12}>
							Pick a delivery window for today. Capacity updates
							in real time.
						</Text>
						<Stack $gap={8}>
							{batchesData.batches.map((b) => {
								const disabled =
									b.status === "paused" ||
									b.status === "closed" ||
									b.status === "full";
								const active =
									selectedBatch?.windowId ===
									b.window._id;
								const statusLabel =
									b.status === "open"
										? "Open"
										: b.status === "paused"
											? "Paused for today"
											: b.status === "closed"
												? "Closed"
												: "Fully booked";
								const statusTone =
									b.status === "open"
										? active
											? "success"
											: "primary"
										: "muted";
								return (
									<BatchCard
										key={b.window._id}
										$active={active}
										style={{
											cursor: disabled
												? "not-allowed"
												: "pointer",
											opacity: disabled ? 0.6 : 1,
										}}
										onClick={() => {
											if (disabled) return;
											setSelectedBatch({
												windowId: b.window._id,
												batchId: b.batch?._id,
											});
										}}
									>
										<Row
											$justify="space-between"
											$gap={10}
										>
											<Stack $gap={2}>
												<Text $weight={700}>
													{b.window.name ||
														`${b.window.mealTime} · Window`}
												</Text>
												<Text $muted $size={12}>
													{b.window.orderWindowStart}
													{" – "}
													{b.window.orderWindowEnd}{" "}
													(order)
													{" · "}
													{b.window.deliveryWindowStart}
													{" – "}
													{b.window.deliveryWindowEnd}{" "}
													(delivery)
												</Text>
											</Stack>
											<Badge $tone={statusTone as any}>
												{statusLabel}
												{" · "}
												{b.capacity.remainingQuantity}{" "}
												left
											</Badge>
										</Row>
									</BatchCard>
								);
							})}
						</Stack>
					</Stack>
				) : (
					modeTab !== "SCHEDULE_AHEAD" && (
						<Text $muted $size={12}>
							No {modeTab.toLowerCase()} delivery window configured.
							Configure delivery windows before posting.
						</Text>
					)
				)}
				</Card>

				<Card>
					<Stack $gap={14}>
						<ItemsHeader>
							<ItemsTitle>
								<span aria-hidden>🍲</span>
								<span>Items</span>
								{selectedCount > 0 && (
									<Badge $tone="primary">
										{selectedCount} selected
									</Badge>
								)}
							</ItemsTitle>
							<ItemsAction>
								<Button
									$size="sm"
									$variant="secondary"
									onClick={seedFromTemplate}
								>
									Seed from timetable
								</Button>
							</ItemsAction>
						</ItemsHeader>

						{batchesData?.batches?.length ? null : null}

						<Stack $gap={8}>
							{menuItems.map((m) => {
								const on = m.id in selected;
								const variants = inheritedVariants(m);
								return (
									<ItemRow
										key={m.id}
										$on={on}
										onClick={() => toggle(m.id)}
									>
										<Stack $gap={on ? 12 : 0}>
											<Row
												$justify="space-between"
												$gap={10}
											>
												<Row $gap={10}>
													<Check $on={on}>
														{on ? "✓" : ""}
													</Check>
													<Text $weight={600}>
														{m.name}
													</Text>
												</Row>
												<Text $weight={700}>
													{menuItemPriceLabel(m)}
												</Text>
											</Row>
											{on && (
												<QtyWrap
													onClick={(e) =>
														e.stopPropagation()
													}
												>
													<Input
														label="Max Plate (blank = unlimited)"
														type="number"
														inputMode="numeric"
														min={1}
														step={1}
														value={selected[m.id]}
														onChange={(e) =>
															setSelected(
																(s) => ({
																	...s,
																	[m.id]: e
																		.target
																		.value,
																}),
															)
														}
														placeholder="Unlimited"
													/>
												</QtyWrap>
											)}
											{on && variants.length > 0 && (
												<VariantReview
													onClick={(e) =>
														e.stopPropagation()
													}
												>
													<Stack $gap={4}>
														<Text
															$weight={700}
															$size={13}
														>
															Inherited variants
														</Text>
														<Text $muted $size={12}>
															These sizes and
															prices are copied
															from the menu into
															this listing.
														</Text>
														{variants.map(
															(variant) => (
																<VariantReviewRow
																	key={
																		variant.id
																	}
																>
																	<Text
																		$weight={
																			600
																		}
																		$size={
																			13
																		}
																	>
																		{
																			variant.name
																		}
																	</Text>
																	<VariantMeta>
																		<Text
																			$weight={
																				700
																			}
																			$size={
																				13
																			}
																		>
																			{formatKobo(
																				variant.priceKobo,
																			)}
																		</Text>
																		{variant.isDefault && (
																			<Badge $tone="primary">
																				Default
																			</Badge>
																		)}
																		<Badge
																			$tone={
																				variant.isActive ===
																				false
																					? "muted"
																					: "success"
																			}
																		>
																			{variant.isActive ===
																			false
																				? "Inactive"
																				: "Active"}
																		</Badge>
																	</VariantMeta>
																</VariantReviewRow>
															),
														)}
													</Stack>
												</VariantReview>
											)}
											{on &&
												attachedGroups(m).length >
													0 && (
													<ItemGroupsEditor
														groups={attachedGroups(
															m,
														)}
														excluded={
															excludedGroups[
																m.id
															] ?? EMPTY_SET
														}
														edits={
															optionEdits[m.id] ??
															EMPTY_EDITS
														}
														onToggle={(gid) =>
															toggleGroupForItem(
																m.id,
																gid,
															)
														}
														onChangeOptions={(
															gid,
															options,
														) =>
															setGroupOptions(
																m.id,
																gid,
																options,
															)
														}
													/>
												)}
										</Stack>
									</ItemRow>
								);
							})}
						</Stack>
					</Stack>
				</Card>

				<SubmitBar>
					<Stack $gap={2}>
						<Text $weight={700}>
							{selectedCount} item
							{selectedCount === 1 ? "" : "s"} ready
						</Text>
						<Text $muted $size={12}>
							{selectedCount === 0
								? "Select dishes to post"
								: isEdit
									? "Save your changes"
									: "Looks good — post it live"}
						</Text>
					</Stack>
					<SubmitAction>
						<Button
							$full
							$size="lg"
							$loading={busy}
							onClick={submit}
						>
							{isEdit ? "Save changes" : "Post daily order"}
						</Button>
					</SubmitAction>
				</SubmitBar>
			</Stack>
		</FadeIn>
	);
}
