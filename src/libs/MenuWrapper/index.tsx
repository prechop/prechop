"use client";

import { useState } from "react";
import styled from "styled-components";
import useSWR from "swr";
import {
	Badge,
	Button,
	Card,
	EmptyState,
	FadeIn,
	Grid,
	Input,
	PageHeader,
	Row,
	SectionHeader,
	Select,
	Skeleton,
	Stack,
	StatCard,
	Text,
	Textarea,
	Title,
} from "@/components";
import { api, apiData } from "@/constants/api";
import { fetcher } from "@/constants/fetcher";
import { formatKobo } from "@/constants/formatters";
import { useToast } from "@/hooks/useToast";
import OptionGroupsManager from "@/libs/OptionGroupsManager";
import type { MenuItem, MenuOptionGroup } from "@/types";

const CATEGORIES = [
	{ value: "MEALS", label: "Meals" },
	{ value: "SNACKS", label: "Snacks" },
	{ value: "DRINKS", label: "Drinks" },
	{ value: "BAKED_GOODS", label: "Baked goods" },
];
const CATEGORY_ORDER = CATEGORIES.map((c) => c.value);
const CATEGORY_ICON: Record<string, string> = {
	MEALS: "🍲",
	SNACKS: "🥟",
	DRINKS: "🥤",
	BAKED_GOODS: "🥐",
};

interface Draft {
	id?: string;
	name: string;
	category: string;
	priceNaira: string;
	description: string;
	estimatedPrepMin: string;
	optionGroupIds: string[];
}

const emptyDraft: Draft = {
	name: "",
	category: "MEALS",
	priceNaira: "",
	description: "",
	estimatedPrepMin: "",
	optionGroupIds: [],
};

const Overlay = styled.div`
	position: fixed;
	inset: 0;
	z-index: 100;
	display: flex;
	align-items: flex-end;
	justify-content: center;
	animation: pc-fade-up var(--pc-dur) var(--pc-ease);
	@media (min-width: 760px) {
		align-items: center;
		padding: var(--pc-space-4);
	}
`;
const Sheet = styled(Card)`
	width: 100%;
	max-width: 540px;
	border-radius: var(--pc-radius-lg) var(--pc-radius-lg) 0 0;
	max-height: 92dvh;
	overflow-y: auto;
	box-shadow: var(--pc-shadow-lg);
	@media (min-width: 760px) {
		border-radius: var(--pc-radius-lg);
		max-height: 88dvh;
	}
`;
const Handle = styled.div`
	width: 40px;
	height: 4px;
	border-radius: 999px;
	background: var(--pc-surface-3);
	margin: 0 auto var(--pc-space-2);
	@media (min-width: 760px) {
		display: none;
	}
`;
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
const Thumb = styled.div<{ $src?: string }>`
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

const GroupChip = styled.button<{ $on: boolean }>`
	all: unset;
	box-sizing: border-box;
	cursor: pointer;
	font-size: 13px;
	font-weight: 600;
	padding: 7px 12px;
	border-radius: var(--pc-radius-pill);
	border: 1.5px solid
		${(p) => (p.$on ? "var(--pc-color-primary)" : "var(--pc-border)")};
	background: ${(p) =>
		p.$on ? "var(--pc-color-primary-50)" : "var(--pc-surface)"};
	color: ${(p) =>
		p.$on ? "var(--pc-color-primary)" : "var(--pc-text-muted)"};
	transition: all var(--pc-dur) var(--pc-ease);
`;

function errMsg(e: unknown): string {
	const m = (e as { response?: { data?: { message?: string } } })?.response
		?.data?.message;
	return m ?? "Something went wrong. Please try again.";
}

export default function MenuWrapper() {
	const { toast } = useToast();
	const { data, isLoading, mutate } = useSWR<MenuItem[]>("/menu", fetcher);
	const { data: groupsData } = useSWR<MenuOptionGroup[]>(
		"/menu/option-groups",
		fetcher,
	);
	const [draft, setDraft] = useState<Draft | null>(null);
	const [busy, setBusy] = useState(false);
	const [uploadingId, setUploadingId] = useState<string | null>(null);
	const [reordering, setReordering] = useState(false);
	const [managingGroups, setManagingGroups] = useState(false);

	const items = data ?? [];
	const optionGroups = groupsData ?? [];

	function openCreate() {
		setDraft({ ...emptyDraft, optionGroupIds: [] });
	}
	function openEdit(it: MenuItem) {
		setDraft({
			id: it.id,
			name: it.name,
			category: it.category,
			priceNaira: String((it.priceKobo ?? 0) / 100),
			description: it.description ?? "",
			estimatedPrepMin: it.estimatedPrepMin
				? String(it.estimatedPrepMin)
				: "",
			optionGroupIds: it.optionGroupIds ?? [],
		});
	}

	async function save() {
		if (!draft) return;
		const price = Number(draft.priceNaira);
		if (!draft.name.trim() || !(price > 0)) {
			toast("Enter a name and a valid price", "error");
			return;
		}
		setBusy(true);
		try {
			const body: Record<string, unknown> = {
				name: draft.name.trim(),
				category: draft.category,
				priceNaira: price,
				optionGroupIds: draft.optionGroupIds,
			};
			if (draft.description.trim())
				body.description = draft.description.trim();
			if (Number(draft.estimatedPrepMin) > 0)
				body.estimatedPrepMin = Number(draft.estimatedPrepMin);

			if (draft.id) {
				await api.patch(`/menu/${draft.id}`, body);
				toast("Menu item updated", "success");
			} else {
				// Append new items to the end of the current order.
				body.displayOrder = items.length;
				await api.post("/menu", body);
				toast("Menu item added", "success");
			}
			setDraft(null);
			await mutate();
		} catch (e) {
			toast(errMsg(e), "error");
		} finally {
			setBusy(false);
		}
	}

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

		const movedCat = moved.category;
		const nextList = CATEGORY_ORDER.flatMap((cat) =>
			cat === movedCat
				? reorderedCat
				: items
						.filter((i) => i.category === cat)
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

	async function uploadImage(it: MenuItem, file: File) {
		setUploadingId(it.id);
		try {
			const presign = await apiData<{
				uploadUrl: string;
				publicReadUrl: string;
			}>(
				api.post(`/menu/${it.id}/image/presign`, {
					mimeType: file.type,
				}),
			);
			const put = await fetch(presign.uploadUrl, {
				method: "PUT",
				body: file,
				headers: { "Content-Type": file.type },
			});
			if (!put.ok) throw new Error("Upload failed");
			await api.post(`/menu/${it.id}/image/confirm`, {
				imageUrl: presign.publicReadUrl,
			});
			toast("Image updated", "success");
			await mutate();
		} catch (e) {
			toast(errMsg(e), "error");
		} finally {
			setUploadingId(null);
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
			.filter((i) => i.category === cat)
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
								<Button $size="sm" $pill onClick={openCreate}>
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
							<Button onClick={openCreate}>
								＋ Add your first item
							</Button>
						}
					/>
				) : (
					<>
						<Grid $min={150} $gap={12}>
							<StatCard
								label="Menu items"
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
						</Grid>

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
												<label
													style={{
														cursor: "pointer",
													}}
												>
													<Thumb $src={it.imageUrl}>
														{it.imageUrl
															? ""
															: "🍲"}
													</Thumb>
													<input
														type="file"
														accept="image/jpeg,image/png,image/webp"
														style={{
															display: "none",
														}}
														disabled={
															uploadingId ===
															it.id
														}
														onChange={(e) => {
															const f =
																e.target
																	.files?.[0];
															if (f)
																uploadImage(
																	it,
																	f,
																);
														}}
													/>
												</label>
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
														{uploadingId ===
															it.id && (
															<Badge $tone="warning">
																Uploading…
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
													onClick={() => openEdit(it)}
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

				{draft && (
					<Overlay onClick={() => !busy && setDraft(null)}>
						<Sheet onClick={(e) => e.stopPropagation()}>
							<Handle />
							<Stack $gap={14}>
								<Row $justify="space-between" $align="center">
									<Title $size={18}>
										{draft.id ? "Edit item" : "New item"}
									</Title>
									<IconBtn
										onClick={() => !busy && setDraft(null)}
									>
										Close
									</IconBtn>
								</Row>
								<Input
									label="Name"
									value={draft.name}
									onChange={(e) =>
										setDraft({
											...draft,
											name: e.target.value,
										})
									}
									placeholder="Jollof rice & chicken"
								/>
								<Select
									label="Category"
									value={draft.category}
									onChange={(e) =>
										setDraft({
											...draft,
											category: e.target.value,
										})
									}
								>
									{CATEGORIES.map((c) => (
										<option key={c.value} value={c.value}>
											{c.label}
										</option>
									))}
								</Select>
								<Input
									label="Price (₦)"
									type="number"
									inputMode="decimal"
									value={draft.priceNaira}
									onChange={(e) =>
										setDraft({
											...draft,
											priceNaira: e.target.value,
										})
									}
									placeholder="1500"
								/>
								<Input
									label="Prep time (mins, optional)"
									type="number"
									inputMode="numeric"
									value={draft.estimatedPrepMin}
									onChange={(e) =>
										setDraft({
											...draft,
											estimatedPrepMin: e.target.value,
										})
									}
									placeholder="20"
								/>
								<Textarea
									label="Description (optional)"
									value={draft.description}
									onChange={(e) =>
										setDraft({
											...draft,
											description: e.target.value,
										})
									}
									placeholder="Smoky party jollof with grilled chicken."
								/>

								<Stack $gap={8}>
									<Row
										$justify="space-between"
										$align="center"
									>
										<Text $weight={600} $size={14}>
											Option groups
										</Text>
										<IconBtn
											type="button"
											onClick={() =>
												setManagingGroups(true)
											}
										>
											Manage
										</IconBtn>
									</Row>
									{optionGroups.length === 0 ? (
										<Text $muted $size={13}>
											Create reusable choices (e.g.
											“Protein”) with “Manage”, then
											attach them here so buyers can pick
											when ordering.
										</Text>
									) : (
										<Row $gap={8} $wrap>
											{optionGroups.map((g) => {
												const on =
													draft.optionGroupIds.includes(
														g.id,
													);
												return (
													<GroupChip
														key={g.id}
														type="button"
														$on={on}
														onClick={() =>
															setDraft({
																...draft,
																optionGroupIds:
																	on
																		? draft.optionGroupIds.filter(
																				(
																					x,
																				) =>
																					x !==
																					g.id,
																			)
																		: [
																				...draft.optionGroupIds,
																				g.id,
																			],
															})
														}
													>
														{on ? "✓ " : ""}
														{g.name}
													</GroupChip>
												);
											})}
										</Row>
									)}
								</Stack>

								<Button $full $loading={busy} onClick={save}>
									{draft.id ? "Save changes" : "Add item"}
								</Button>
							</Stack>
						</Sheet>
					</Overlay>
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
