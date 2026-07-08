"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import styled from "styled-components";
import useSWR from "swr";
import { Button, Card, Input, Row, Stack, Text, Title } from "@/components";
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
	border-color: ${(p) =>
		p.$on ? "var(--pc-color-primary)" : "var(--pc-border)"};
	background: ${(p) =>
		p.$on ? "var(--pc-color-primary-50)" : "var(--pc-surface)"};
	cursor: pointer;
`;
const Check = styled.span<{ $on: boolean }>`
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 24px;
	height: 24px;
	border-radius: 6px;
	flex-shrink: 0;
	font-size: 14px;
	font-weight: 700;
	color: #fff;
	background: ${(p) =>
		p.$on ? "var(--pc-color-primary)" : "var(--pc-surface-2)"};
	border: 1px solid
		${(p) => (p.$on ? "var(--pc-color-primary)" : "var(--pc-border)")};
`;
const Switch = styled.button<{ $on: boolean }>`
	position: relative;
	width: 44px;
	height: 26px;
	border-radius: 999px;
	border: none;
	cursor: pointer;
	flex-shrink: 0;
	background: ${(p) =>
		p.$on ? "var(--pc-color-success)" : "var(--pc-surface-2)"};
	&::after {
		content: "";
		position: absolute;
		top: 3px;
		left: ${(p) => (p.$on ? "21px" : "3px")};
		width: 20px;
		height: 20px;
		border-radius: 999px;
		background: #fff;
		box-shadow: var(--pc-shadow);
		transition: left 0.15s ease;
	}
`;
const Empty = styled(Card)`
	text-align: center;
	padding: var(--pc-space-8) var(--pc-space-5);
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
			<Stack $gap={16}>
				<Title $size={24}>New daily order</Title>
				<Empty>
					<Stack $gap={6}>
						<Text $weight={700} $size={16}>
							No available menu items
						</Text>
						<Text $muted>
							Add and enable menu items before composing a daily
							order.
						</Text>
						<div>
							<Button onClick={() => router.push("/menu")}>
								Go to menu
							</Button>
						</div>
					</Stack>
				</Empty>
			</Stack>
		);
	}

	const selectedCount = Object.keys(selected).length;

	return (
		<Stack $gap={16}>
			<Title $size={24}>New daily order</Title>

			<Card>
				<Stack $gap={12}>
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

					<Row $justify="space-between" $align="center">
						<Text $weight={600}>Pickup available</Text>
						<Switch
							$on={pickup}
							onClick={() => setPickup((v) => !v)}
							aria-label="Toggle pickup"
						/>
					</Row>
					<Row $justify="space-between" $align="center">
						<Text $weight={600}>Delivery available</Text>
						<Switch
							$on={delivery}
							onClick={() => setDelivery((v) => !v)}
							aria-label="Toggle delivery"
						/>
					</Row>
					{delivery && (
						<Input
							label="Delivery fee (₦)"
							type="number"
							inputMode="decimal"
							value={deliveryFee}
							onChange={(e) => setDeliveryFee(e.target.value)}
							placeholder="200"
						/>
					)}
				</Stack>
			</Card>

			<Row $justify="space-between" $align="center">
				<Title $size={17}>
					Items {selectedCount > 0 && `(${selectedCount})`}
				</Title>
				<Button
					$size="sm"
					$variant="secondary"
					onClick={seedFromTemplate}
				>
					Seed from timetable
				</Button>
			</Row>

			<Stack $gap={8}>
				{menuItems.map((m) => {
					const on = m.id in selected;
					return (
						<ItemRow
							key={m.id}
							$on={on}
							onClick={() => toggle(m.id)}
						>
							<Stack $gap={on ? 10 : 0}>
								<Row $justify="space-between" $gap={10}>
									<Row $gap={10}>
										<Check $on={on}>{on ? "✓" : ""}</Check>
										<Text $weight={600}>{m.name}</Text>
									</Row>
									<Text $weight={600}>
										{formatKobo(m.priceKobo)}
									</Text>
								</Row>
								{on && (
									// biome-ignore lint/a11y/noStaticElementInteractions: wrapper only halts the row-toggle click from bubbling
									// biome-ignore lint/a11y/useKeyWithClickEvents: no keyboard action — purely stops click propagation to the parent toggle
									<div onClick={(e) => e.stopPropagation()}>
										<Input
											label="Max quantity (blank = unlimited)"
											type="number"
											inputMode="numeric"
											value={selected[m.id]}
											onChange={(e) =>
												setSelected((s) => ({
													...s,
													[m.id]: e.target.value,
												}))
											}
											placeholder="Unlimited"
										/>
									</div>
								)}
							</Stack>
						</ItemRow>
					);
				})}
			</Stack>

			<Button $full $size="lg" $loading={busy} onClick={submit}>
				Post daily order
			</Button>
		</Stack>
	);
}
