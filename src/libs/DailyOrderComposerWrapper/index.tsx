"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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
import type { MenuItem } from "@/types";

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
function defaultCutoff(): string {
	const d = new Date(Date.now() + 3 * 60 * 60 * 1000);
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
		d.getHours(),
	)}:${pad(d.getMinutes())}`;
}

export default function DailyOrderComposerWrapper() {
	const router = useRouter();
	const { toast } = useToast();
	const { data: menu, isLoading } = useSWR<MenuItem[]>("/menu", fetcher);

	const [title, setTitle] = useState("");
	const [scheduledDate, setScheduledDate] = useState(defaultDate());
	const [cutoff, setCutoff] = useState(defaultCutoff());
	const [pickup, setPickup] = useState(true);
	const [delivery, setDelivery] = useState(false);
	const [deliveryFee, setDeliveryFee] = useState("");
	const [selected, setSelected] = useState<Record<string, string>>({});
	const [busy, setBusy] = useState(false);

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
		setBusy(true);
		try {
			const items = ids.map((id) => {
				const q = Number(selected[id]);
				return {
					menuItemId: id,
					...(q > 0 ? { maxQuantity: Math.floor(q) } : {}),
				};
			});
			await api.post("/daily-orders", {
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
			});
			toast("Daily order posted", "success");
			router.push("/dashboard");
		} catch (e) {
			toast(errMsg(e), "error");
		} finally {
			setBusy(false);
		}
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
