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
import type { DailyOrder, MenuItem } from "@/types";

interface TemplateEntry {
	menuItem: { id?: string; _id?: string } | null;
}

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

interface Published {
	token: string;
	title: string;
}

export default function DailyOrderComposerWrapper() {
	const router = useRouter();
	const { toast } = useToast();
	const { data: menu, isLoading } = useSWR<MenuItem[]>("/menu", fetcher);
	const { data: vendor } = useSWR<VendorMe>("/vendors/me", fetcher);
	// Today's timetable, used to pre-fill the item selection (#8).
	const { data: template } = useSWR<TemplateEntry[]>(
		"/timetable/today-template",
		fetcher,
	);

	const [title, setTitle] = useState("");
	const [scheduledDate, setScheduledDate] = useState(defaultDate());
	const [cutoff, setCutoff] = useState(defaultCutoff());
	const [pickup, setPickup] = useState(true);
	const [delivery, setDelivery] = useState(false);
	const [deliveryFee, setDeliveryFee] = useState("");
	const [selected, setSelected] = useState<Record<string, string>>({});
	const [busy, setBusy] = useState(false);
	const [published, setPublished] = useState<Published | null>(null);
	const [copied, setCopied] = useState(false);

	// Seed fulfilment toggles from the vendor's saved delivery defaults, once.
	const seededDefaults = useRef(false);
	useEffect(() => {
		if (!vendor || seededDefaults.current) return;
		seededDefaults.current = true;
		setPickup(vendor.defaultPickupAvailable ?? true);
		setDelivery(vendor.defaultDeliveryAvailable ?? false);
		if (vendor.defaultDeliveryFeeKobo)
			setDeliveryFee(String(vendor.defaultDeliveryFeeKobo / 100));
	}, [vendor]);

	// Pre-fill the item selection from today's timetable, once, if the vendor
	// hasn't picked anything yet.
	const seededItems = useRef(false);
	useEffect(() => {
		if (!template || seededItems.current) return;
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
	}, [template]);

	if (isLoading) return <PageLoader />;

	const menuItems = (menu ?? []).filter((m) => m.isAvailable);

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
				api.get("/timetable/today-template"),
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
			toast("The order cutoff must be in the future", "error");
			return;
		}
		setBusy(true);
		try {
			const items = ids.map((id) => {
				const q = Number(selected[id]);
				return {
					menuItemId: id,
					...(q > 0 ? { maxQuantity: Math.floor(q) } : {}),
				};
			});
			const order = await apiData<DailyOrder>(
				api.post("/daily-orders", {
					title: title.trim(),
					scheduledDate: new Date(scheduledDate).toISOString(),
					cutoffTime: new Date(cutoff).toISOString(),
					pickupAvailable: pickup,
					deliveryAvailable: delivery,
					deliveryFeeKobo:
						delivery && Number(deliveryFee) > 0
							? Math.round(Number(deliveryFee) * 100)
							: 0,
					draft: false,
					items,
				}),
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
					title="New daily order"
					subtitle="Pick today's dishes, set availability, and open the kitchen for orders."
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
						<Row $gap={12} $wrap>
							<div style={{ flex: 1, minWidth: 140 }}>
								<Input
									label="Date"
									type="date"
									min={defaultDate()}
									value={scheduledDate}
									onChange={(e) =>
										setScheduledDate(e.target.value)
									}
								/>
							</div>
							<div style={{ flex: 1, minWidth: 140 }}>
								<Input
									label="Order cutoff"
									type="datetime-local"
									min={nowLocal()}
									value={cutoff}
									onChange={(e) => setCutoff(e.target.value)}
								/>
							</div>
						</Row>

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
							Post daily order
						</Button>
					</SubmitAction>
				</SubmitBar>
			</Stack>
		</FadeIn>
	);
}
