"use client";

import { useState } from "react";
import styled from "styled-components";
import useSWR from "swr";
import {
	Badge,
	Button,
	Card,
	Input,
	Row,
	Select,
	Stack,
	Text,
	Textarea,
	Title,
} from "@/components";
import { PageLoader } from "@/components/Loader";
import { api, apiData } from "@/constants/api";
import { fetcher } from "@/constants/fetcher";
import { formatKobo } from "@/constants/formatters";
import { useToast } from "@/hooks/useToast";
import type { MenuItem } from "@/types";

const CATEGORIES = [
	{ value: "MEALS", label: "Meals" },
	{ value: "SNACKS", label: "Snacks" },
	{ value: "DRINKS", label: "Drinks" },
	{ value: "BAKED_GOODS", label: "Baked goods" },
];
const CATEGORY_ORDER = CATEGORIES.map((c) => c.value);

interface Draft {
	id?: string;
	name: string;
	category: string;
	priceNaira: string;
	description: string;
	estimatedPrepMin: string;
}

const emptyDraft: Draft = {
	name: "",
	category: "MEALS",
	priceNaira: "",
	description: "",
	estimatedPrepMin: "",
};

const Overlay = styled.div`
	position: fixed;
	inset: 0;
	z-index: 100;
	background: rgba(0, 0, 0, 0.4);
	display: flex;
	align-items: flex-end;
	justify-content: center;
`;
const Sheet = styled(Card)`
	width: 100%;
	max-width: var(--pc-maxw);
	border-radius: var(--pc-radius) var(--pc-radius) 0 0;
	max-height: 92dvh;
	overflow-y: auto;
`;
const ItemCard = styled(Card)`
	padding: var(--pc-space-4);
`;
const Thumb = styled.div<{ $src?: string }>`
	width: 56px;
	height: 56px;
	border-radius: var(--pc-radius-sm);
	flex-shrink: 0;
	background: ${(p) =>
		p.$src
			? `center / cover no-repeat url(${p.$src})`
			: "var(--pc-surface-2)"};
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 24px;
`;
const Empty = styled(Card)`
	text-align: center;
	padding: var(--pc-space-8) var(--pc-space-5);
`;
const IconBtn = styled.button`
	all: unset;
	cursor: pointer;
	font-size: 13px;
	font-weight: 600;
	color: var(--pc-text-muted);
	padding: 4px 6px;
	&:hover {
		color: var(--pc-text);
	}
`;

function errMsg(e: unknown): string {
	const m = (e as { response?: { data?: { message?: string } } })?.response
		?.data?.message;
	return m ?? "Something went wrong. Please try again.";
}

export default function MenuWrapper() {
	const { toast } = useToast();
	const { data, isLoading, mutate } = useSWR<MenuItem[]>("/menu", fetcher);
	const [draft, setDraft] = useState<Draft | null>(null);
	const [busy, setBusy] = useState(false);
	const [uploadingId, setUploadingId] = useState<string | null>(null);

	const items = data ?? [];

	function openCreate() {
		setDraft({ ...emptyDraft });
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
			};
			if (draft.description.trim())
				body.description = draft.description.trim();
			if (Number(draft.estimatedPrepMin) > 0)
				body.estimatedPrepMin = Number(draft.estimatedPrepMin);

			if (draft.id) {
				await api.patch(`/menu/${draft.id}`, body);
				toast("Menu item updated", "success");
			} else {
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

	if (isLoading) return <PageLoader />;

	const grouped = CATEGORY_ORDER.map((cat) => ({
		cat,
		label: CATEGORIES.find((c) => c.value === cat)?.label ?? cat,
		items: items.filter((i) => i.category === cat),
	})).filter((g) => g.items.length > 0);

	return (
		<Stack $gap={16}>
			<Row $justify="space-between" $align="center">
				<Title $size={24}>Menu</Title>
				<Button $size="sm" onClick={openCreate}>
					＋ Add item
				</Button>
			</Row>

			{items.length === 0 ? (
				<Empty>
					<Stack $gap={10}>
						<Text $weight={700} $size={16}>
							Your menu is empty
						</Text>
						<Text $muted>
							Add the dishes you sell so you can include them in
							daily orders.
						</Text>
						<div>
							<Button onClick={openCreate}>
								＋ Add your first item
							</Button>
						</div>
					</Stack>
				</Empty>
			) : (
				grouped.map((g) => (
					<Stack key={g.cat} $gap={10}>
						<Text $weight={700} $muted $size={13}>
							{g.label.toUpperCase()}
						</Text>
						{g.items.map((it) => (
							<ItemCard key={it.id}>
								<Stack $gap={10}>
									<Row $gap={12} $align="flex-start">
										<label style={{ cursor: "pointer" }}>
											<Thumb $src={it.imageUrl}>
												{it.imageUrl ? "" : "🍲"}
											</Thumb>
											<input
												type="file"
												accept="image/jpeg,image/png,image/webp"
												style={{ display: "none" }}
												disabled={uploadingId === it.id}
												onChange={(e) => {
													const f =
														e.target.files?.[0];
													if (f) uploadImage(it, f);
												}}
											/>
										</label>
										<Stack
											$gap={4}
											style={{ flex: 1, minWidth: 0 }}
										>
											<Row
												$justify="space-between"
												$gap={8}
												$align="flex-start"
											>
												<Text $weight={700}>
													{it.name}
												</Text>
												<Text $weight={700}>
													{formatKobo(it.priceKobo)}
												</Text>
											</Row>
											{it.description && (
												<Text $muted $size={13}>
													{it.description}
												</Text>
											)}
											<Row $gap={6} $wrap>
												{!it.isAvailable && (
													<Badge $tone="muted">
														Hidden
													</Badge>
												)}
												{it.isSoldOut && (
													<Badge $tone="danger">
														Sold out
													</Badge>
												)}
												{uploadingId === it.id && (
													<Badge $tone="warning">
														Uploading…
													</Badge>
												)}
											</Row>
										</Stack>
									</Row>
									<Row $gap={8} $wrap>
										<IconBtn
											onClick={() => toggleAvailable(it)}
										>
											{it.isAvailable ? "Hide" : "Show"}
										</IconBtn>
										<IconBtn
											onClick={() => toggleSoldOut(it)}
										>
											{it.isSoldOut
												? "Mark in stock"
												: "Mark sold out"}
										</IconBtn>
										<IconBtn onClick={() => openEdit(it)}>
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
									</Row>
								</Stack>
							</ItemCard>
						))}
					</Stack>
				))
			)}

			{draft && (
				<Overlay onClick={() => !busy && setDraft(null)}>
					<Sheet onClick={(e) => e.stopPropagation()}>
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
									setDraft({ ...draft, name: e.target.value })
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
							<Button $full $loading={busy} onClick={save}>
								{draft.id ? "Save changes" : "Add item"}
							</Button>
						</Stack>
					</Sheet>
				</Overlay>
			)}
		</Stack>
	);
}
