"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
	Stack,
	Text,
} from "@/components";
import { PageLoader } from "@/components/Loader";
import { api, apiData } from "@/constants/api";
import { fetcher } from "@/constants/fetcher";
import { formatKobo } from "@/constants/formatters";
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

const ItemRow = styled(Card)<{ $on: boolean }>`
	padding: var(--pc-space-3) var(--pc-space-4);
	cursor: pointer;
	border-color: ${(p) =>
		p.$on ? "var(--pc-color-primary)" : "var(--pc-border)"};
	background: ${(p) =>
		p.$on ? "var(--pc-color-primary-50)" : "var(--pc-surface)"};
	box-shadow: ${(p) => (p.$on ? "var(--pc-shadow-primary)" : "var(--pc-shadow-sm)")};
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
const ToggleRow = styled.div`
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--pc-space-3);
	padding: var(--pc-space-3) var(--pc-space-4);
	background: var(--pc-surface-2);
	border: 1px solid var(--pc-border);
	border-radius: var(--pc-radius-sm);
`;
const Switch = styled.button<{ $on: boolean }>`
	position: relative;
	width: 46px;
	height: 27px;
	border-radius: var(--pc-radius-pill);
	border: none;
	cursor: pointer;
	flex-shrink: 0;
	transition: background var(--pc-dur) var(--pc-ease);
	background: ${(p) =>
		p.$on ? "var(--pc-color-accent)" : "var(--pc-surface-3)"};
	&::after {
		content: "";
		position: absolute;
		top: 3px;
		left: ${(p) => (p.$on ? "22px" : "3px")};
		width: 21px;
		height: 21px;
		border-radius: 999px;
		background: var(--pc-text-inverse);
		box-shadow: var(--pc-shadow);
		transition: left var(--pc-dur) var(--pc-ease);
	}
`;
const QtyWrap = styled.div`
	padding-left: 36px;
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

/* ── Post-publish share screen (#9) ─────────────────────────────────────── */
const SuccessHero = styled(Card)`
	text-align: center;
	background: var(--pc-gradient-hero);
	border: none;
	color: #fff;
	box-shadow: var(--pc-shadow-primary);
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
	padding: 13px;
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
	token: string;
	title: string;
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
	}, [isEdit, vendor]);

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
		setTitle((t) => t || "Today's menu");
	}, [template, isEdit]);

	if (isLoading || (isEdit && editingLoading)) return <PageLoader />;

	// A listing can only be edited before it opens for orders. Mirror the server
	// lock (`assertActiveVendor` + the availableFrom window) so an already-open
	// or closed listing shows a clear message instead of a form that would 409.
	const opensAt = editing?.availableFrom
		? new Date(editing.availableFrom).getTime()
		: null;
	const editLocked =
		isEdit &&
		!!editing &&
		(editing.status === "CLOSED" ||
			editing.status === "CANCELLED" ||
			opensAt === null ||
			opensAt <= Date.now());
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
						description="Orders have already opened for this listing, so it can’t be edited. You can still close or cancel it from your dashboard."
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

	const menuItems = (menu ?? []).filter((m) => m.isAvailable);
	const groupById = new Map((groupsData ?? []).map((g) => [g.id, g]));

	/** Library option groups attached to a menu item, in attach order. */
	function attachedGroups(item: MenuItem): MenuOptionGroup[] {
		return (item.optionGroupIds ?? [])
			.map((id) => groupById.get(id))
			.filter((g): g is MenuOptionGroup => Boolean(g));
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
		// Orders must close on or before the menu date (same-day close is fine).
		if (cutoff.slice(0, 10) > scheduledDate) {
			toast("Orders must close on or before the menu date", "error");
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
		setBusy(true);
		try {
			const body = {
				title: title.trim(),
				scheduledDate: new Date(scheduledDate).toISOString(),
				availableFrom: new Date(availableFrom).toISOString(),
				cutoffTime: new Date(cutoff).toISOString(),
				pickupAvailable: pickup,
				deliveryAvailable: delivery,
				deliveryFeeKobo:
					delivery && Number(deliveryFee) > 0
						? Math.round(Number(deliveryFee) * 100)
						: 0,
				items,
			};

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
			setPublished({ token: order.shareableToken, title: order.title });
		} catch (e) {
			toast(errMsg(e), "error");
		} finally {
			setBusy(false);
		}
	}

	if (published) {
		const shareUrl =
			typeof window !== "undefined"
				? `${window.location.origin}/o/${published.token}`
				: `/o/${published.token}`;
		const shareText = `${published.title} — order now on Prechop: ${shareUrl}`;
		const waHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
		const tgHref = `https://t.me/share/url?url=${encodeURIComponent(
			shareUrl,
		)}&text=${encodeURIComponent(published.title)}`;

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
								“{published.title}” is open for orders. Share
								the link so buyers can order.
							</Text>
						</Stack>
					</SuccessHero>

					<Card>
						<Stack $gap={14}>
							<SectionHeader
								title="Share your order link"
								icon="🔗"
							/>
							<LinkBox>
								<LinkText>{shareUrl}</LinkText>
								<Button
									$size="sm"
									$variant={copied ? "secondary" : "primary"}
									onClick={copyLink}
								>
									{copied ? "Copied ✓" : "Copy"}
								</Button>
							</LinkBox>
							<ShareGrid>
								<ShareBtn
									href={waHref}
									target="_blank"
									rel="noopener noreferrer"
									$bg="#25D366"
								>
									<span aria-hidden>💬</span> WhatsApp
								</ShareBtn>
								<ShareBtn
									href={tgHref}
									target="_blank"
									rel="noopener noreferrer"
									$bg="#229ED9"
								>
									<span aria-hidden>✈️</span> Telegram
								</ShareBtn>
							</ShareGrid>
						</Stack>
					</Card>

					<Row $gap={12} $wrap>
						<div style={{ flex: 1, minWidth: 160 }}>
							<Link
								href={`/o/${published.token}`}
								target="_blank"
							>
								<Button $variant="secondary" $full>
									View listing
								</Button>
							</Link>
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
					<Stack $gap={16}>
						<SectionHeader title="Details" icon="📝" />
						<Input
							label="Title"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							placeholder="Friday lunch specials"
						/>
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
						<Row $gap={12} $wrap>
							<div style={{ flex: 1, minWidth: 160 }}>
								<Input
									label="Orders open (start)"
									type="datetime-local"
									min={nowLocal()}
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
									min={availableFrom || nowLocal()}
									// Orders can't close past the menu date's day.
									max={`${scheduledDate}T23:59`}
									value={cutoff}
									onChange={(e) => setCutoff(e.target.value)}
								/>
							</div>
						</Row>
						<Text $muted $size={12}>
							Before it opens, buyers see this listing as “coming
							soon”. After it closes it’s pulled from the main
							page.
						</Text>

						<Stack $gap={10}>
							<ToggleRow>
								<Stack $gap={2}>
									<Text $weight={600}>
										🥡 Pickup available
									</Text>
									<Text $muted $size={12}>
										Buyers collect from your spot
									</Text>
								</Stack>
								<Switch
									type="button"
									$on={pickup}
									onClick={() => setPickup((v) => !v)}
									aria-label="Toggle pickup"
								/>
							</ToggleRow>
							<ToggleRow>
								<Stack $gap={2}>
									<Text $weight={600}>
										🛵 Delivery available
									</Text>
									<Text $muted $size={12}>
										Deliver to hostels for a fee
									</Text>
								</Stack>
								<Switch
									type="button"
									$on={delivery}
									onClick={() => setDelivery((v) => !v)}
									aria-label="Toggle delivery"
								/>
							</ToggleRow>
							{delivery && (
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
							)}
						</Stack>
					</Stack>
				</Card>

				<Card>
					<Stack $gap={14}>
						<SectionHeader
							title={
								<Row $gap={8} $align="center">
									<span>Items</span>
									{selectedCount > 0 && (
										<Badge $tone="primary">
											{selectedCount} selected
										</Badge>
									)}
								</Row>
							}
							icon="🍲"
							action={
								<Button
									$size="sm"
									$variant="secondary"
									onClick={seedFromTemplate}
								>
									Seed from timetable
								</Button>
							}
						/>

						<Stack $gap={8}>
							{menuItems.map((m) => {
								const on = m.id in selected;
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
													{formatKobo(m.priceKobo)}
												</Text>
											</Row>
											{on && (
												<QtyWrap
													onClick={(e) =>
														e.stopPropagation()
													}
												>
													<Input
														label="Max quantity (blank = unlimited)"
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
