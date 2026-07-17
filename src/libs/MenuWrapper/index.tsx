"use client";

import Link from "next/link";
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
	PageHeader,
	Row,
	SectionHeader,
	Skeleton,
	Stack,
	StatCard,
	Text,
} from "@/components";
import { api } from "@/constants/api";
import { fetcher } from "@/constants/fetcher";
import { formatKobo } from "@/constants/formatters";
import {
	MENU_CATEGORIES,
	MENU_CATEGORY_ICONS,
	normalizeMenuCategory,
} from "@/constants/menuCategories";
import { useToast } from "@/hooks/useToast";
import OptionGroupsManager from "@/libs/OptionGroupsManager";
import type { MenuItem } from "@/types";

const CATEGORIES = MENU_CATEGORIES;
const CATEGORY_ORDER = CATEGORIES.map((c) => c.value);
const CATEGORY_ICON = MENU_CATEGORY_ICONS;

const ReorderCol = styled.div`
	display: flex;
	flex-direction: column;
	gap: 2px;
	flex-shrink: 0;
`;
const ArrowBtn = styled.button`
	all: unset;
	box-sizing: border-box;
	cursor: pointer;
	width: 30px;
	height: 24px;
	display: grid;
	place-items: center;
	border-radius: var(--pc-radius-sm);
	color: var(--pc-text-muted);
	font-size: 13px;
	background: var(--pc-surface-2);
	transition: background var(--pc-dur) var(--pc-ease),
		color var(--pc-dur) var(--pc-ease);
	&:hover:not(:disabled) {
		background: var(--pc-color-primary-50);
		color: var(--pc-color-primary);
	}
	&:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
`;
const ItemCard = styled(Card)`
	padding: var(--pc-space-4);
	transition: box-shadow var(--pc-dur) var(--pc-ease),
		border-color var(--pc-dur) var(--pc-ease);
	&:hover {
		box-shadow: var(--pc-shadow);
		border-color: var(--pc-surface-3);
	}
`;
// The thumbnail is a link to the edit page (image is edited there now).
const Thumb = styled(Link)<{ $src?: string }>`
	width: 64px;
	height: 64px;
	border-radius: var(--pc-radius-sm);
	flex-shrink: 0;
	background: ${(p) =>
		p.$src
			? `center / cover no-repeat url(${p.$src})`
			: "var(--pc-color-primary-50)"};
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 26px;
	position: relative;
	overflow: hidden;
	transition: transform var(--pc-dur) var(--pc-ease);
	&:hover {
		transform: scale(1.03);
	}
	&::after {
		content: "✎";
		position: absolute;
		right: 4px;
		bottom: 4px;
		width: 20px;
		height: 20px;
		display: grid;
		place-items: center;
		font-size: 11px;
		border-radius: 999px;
		background: var(--pc-surface);
		color: var(--pc-text-muted);
		box-shadow: var(--pc-shadow-sm);
	}
`;
const Price = styled.span`
	font-family: var(--pc-font-display);
	font-weight: 800;
	font-size: 16px;
	letter-spacing: -0.02em;
	color: var(--pc-color-primary);
	white-space: nowrap;
`;
const Actions = styled(Row)`
	border-top: 1px solid var(--pc-border);
	padding-top: var(--pc-space-3);
`;
const IconBtn = styled.button`
	all: unset;
	cursor: pointer;
	font-size: 13px;
	font-weight: 700;
	color: var(--pc-text-muted);
	padding: 6px 10px;
	border-radius: var(--pc-radius-pill);
	transition: background var(--pc-dur) var(--pc-ease),
		color var(--pc-dur) var(--pc-ease);
	&:hover {
		color: var(--pc-text);
		background: var(--pc-surface-2);
	}
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

	@media (min-width: 390px) {
		> div > div:nth-child(2) {
			font-size: 22px;
		}
	}
`;

function errMsg(e: unknown): string {
	const m = (e as { response?: { data?: { message?: string } } })?.response
		?.data?.message;
	return m ?? "Something went wrong. Please try again.";
}

export default function MenuWrapper() {
	const router = useRouter();
	const { toast } = useToast();
	const { data, isLoading, mutate } = useSWR<MenuItem[]>("/menu", fetcher);
	const [reordering, setReordering] = useState(false);
	const [managingGroups, setManagingGroups] = useState(false);

	const items = data ?? [];

	async function remove(it: MenuItem) {
		if (!window.confirm(`Delete "${it.name}"?`)) return;
		try {
			await api.delete(`/menu/${it.id}`);
			toast("Menu item deleted", "success");
			await mutate();
		} catch (e) {
			toast(errMsg(e), "error");
		}
	}

	/**
	 * Move an item up/down within its category group. Reassigns a clean,
	 * sequential `displayOrder` across the whole (category-ordered) list so the
	 * new order survives a reload, and optimistically updates the SWR cache.
	 */
	async function moveItem(catItems: MenuItem[], index: number, dir: -1 | 1) {
		const target = index + dir;
		if (target < 0 || target >= catItems.length || reordering) return;

		const reorderedCat = [...catItems];
		const [moved] = reorderedCat.splice(index, 1);
		reorderedCat.splice(target, 0, moved);

		const movedCat = normalizeMenuCategory(moved.category);
		const nextList = CATEGORY_ORDER.flatMap((cat) =>
			cat === movedCat
				? reorderedCat
				: items
						.filter(
							(i) => normalizeMenuCategory(i.category) === cat,
						)
						.sort((a, b) => a.displayOrder - b.displayOrder),
		).map((it, i) => ({ ...it, displayOrder: i }));

		setReordering(true);
		try {
			await mutate(nextList, { revalidate: false });
			await api.post("/menu/reorder", {
				items: nextList.map((it) => ({
					id: it.id,
					displayOrder: it.displayOrder,
				})),
			});
			await mutate();
		} catch (e) {
			toast(errMsg(e), "error");
			await mutate();
		} finally {
			setReordering(false);
		}
	}

	async function toggleAvailable(it: MenuItem) {
		try {
			await api.patch(`/menu/${it.id}/availability`, {
				isAvailable: !it.isAvailable,
			});
			await mutate();
		} catch (e) {
			toast(errMsg(e), "error");
		}
	}

	async function toggleSoldOut(it: MenuItem) {
		try {
			await api.patch(`/menu/${it.id}/sold-out`, {
				isSoldOut: !it.isSoldOut,
			});
			await mutate();
		} catch (e) {
			toast(errMsg(e), "error");
		}
	}

	if (isLoading)
		return (
			<Stack $gap={16}>
				<PageHeader eyebrow="Menu" title="Your menu" />
				<Stack $gap={12}>
					{[0, 1, 2].map((i) => (
						<Card key={i}>
							<Row $gap={12} $align="flex-start">
								<Skeleton $w="64px" $h={64} $radius="10px" />
								<Stack $gap={8} style={{ flex: 1 }}>
									<Skeleton $w="60%" $h={18} />
									<Skeleton $w="90%" $h={13} />
									<Skeleton $w="35%" $h={13} />
								</Stack>
							</Row>
						</Card>
					))}
				</Stack>
			</Stack>
		);

	const grouped = CATEGORY_ORDER.map((cat) => ({
		cat,
		label: CATEGORIES.find((c) => c.value === cat)?.label ?? cat,
		items: items
			.filter((i) => normalizeMenuCategory(i.category) === cat)
			.sort((a, b) => a.displayOrder - b.displayOrder),
	})).filter((g) => g.items.length > 0);

	const availableCount = items.filter((i) => i.isAvailable).length;
	const soldOutCount = items.filter((i) => i.isSoldOut).length;

	return (
		<FadeIn>
			<Stack $gap={20}>
				<PageHeader
					eyebrow="Menu"
					title="Your menu"
					subtitle="Add and manage the dishes you sell. Keep prices and availability fresh."
					actions={
						items.length > 0 && (
							<Row $gap={8}>
								<Button
									$size="sm"
									$pill
									$variant="secondary"
									onClick={() => setManagingGroups(true)}
								>
									🧩 Option groups
								</Button>
								<Button
									$size="sm"
									$pill
									onClick={() => router.push("/menu/new")}
								>
									＋ Add item
								</Button>
							</Row>
						)
					}
				/>

				{items.length === 0 ? (
					<EmptyState
						icon="🍲"
						title="Your menu is empty"
						description="Add the dishes you sell so you can include them in daily orders."
						action={
							<Button onClick={() => router.push("/menu/new")}>
								＋ Add your first item
							</Button>
						}
					/>
				) : (
					<>
						<CompactStatsGrid>
							<StatCard
								label="Items"
								value={items.length}
								icon="🍽️"
							/>
							<StatCard
								label="Available"
								value={availableCount}
								icon="✅"
								tone="var(--pc-color-accent)"
							/>
							<StatCard
								label="Sold out"
								value={soldOutCount}
								icon="🚫"
								tone="var(--pc-color-danger)"
							/>
						</CompactStatsGrid>

						{grouped.map((g) => (
							<Stack key={g.cat} $gap={12}>
								<SectionHeader
									title={g.label}
									icon={CATEGORY_ICON[g.cat] ?? "🍴"}
									action={
										<Badge $tone="muted">
											{g.items.length}
										</Badge>
									}
								/>
								{g.items.map((it, idx) => (
									<ItemCard key={it.id}>
										<Stack $gap={12}>
											<Row $gap={12} $align="flex-start">
												<ReorderCol>
													<ArrowBtn
														type="button"
														aria-label={`Move ${it.name} up`}
														disabled={
															idx === 0 ||
															reordering
														}
														onClick={() =>
															moveItem(
																g.items,
																idx,
																-1,
															)
														}
													>
														▲
													</ArrowBtn>
													<ArrowBtn
														type="button"
														aria-label={`Move ${it.name} down`}
														disabled={
															idx ===
																g.items.length -
																	1 ||
															reordering
														}
														onClick={() =>
															moveItem(
																g.items,
																idx,
																1,
															)
														}
													>
														▼
													</ArrowBtn>
												</ReorderCol>
												<Thumb
													href={`/menu/${it.id}/edit`}
													$src={it.imageUrl}
													aria-label={`Edit ${it.name}`}
												>
													{it.imageUrl ? "" : "🍲"}
												</Thumb>
												<Stack
													$gap={5}
													style={{
														flex: 1,
														minWidth: 0,
													}}
												>
													<Row
														$justify="space-between"
														$gap={8}
														$align="flex-start"
													>
														<Text $weight={700}>
															{it.name}
														</Text>
														<Price>
															{formatKobo(
																it.priceKobo,
															)}
														</Price>
													</Row>
													{it.description && (
														<Text $muted $size={13}>
															{it.description}
														</Text>
													)}
													<Row $gap={6} $wrap>
														{it.isAvailable ? (
															<Badge $tone="success">
																Live
															</Badge>
														) : (
															<Badge $tone="muted">
																Hidden
															</Badge>
														)}
														{it.isSoldOut && (
															<Badge $tone="danger">
																Sold out
															</Badge>
														)}
													</Row>
												</Stack>
											</Row>
											<Actions $gap={4} $wrap>
												<IconBtn
													onClick={() =>
														toggleAvailable(it)
													}
												>
													{it.isAvailable
														? "Hide"
														: "Show"}
												</IconBtn>
												<IconBtn
													onClick={() =>
														toggleSoldOut(it)
													}
												>
													{it.isSoldOut
														? "Mark in stock"
														: "Mark sold out"}
												</IconBtn>
												<IconBtn
													onClick={() =>
														router.push(
															`/menu/${it.id}/edit`,
														)
													}
												>
													Edit
												</IconBtn>
												<IconBtn
													onClick={() => remove(it)}
													style={{
														color: "var(--pc-color-danger)",
													}}
												>
													Delete
												</IconBtn>
											</Actions>
										</Stack>
									</ItemCard>
								))}
							</Stack>
						))}
					</>
				)}

				{managingGroups && (
					<OptionGroupsManager
						onClose={() => setManagingGroups(false)}
					/>
				)}
			</Stack>
		</FadeIn>
	);
}
