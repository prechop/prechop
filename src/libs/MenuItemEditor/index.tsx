"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import useSWR, { mutate as globalMutate } from "swr";
import {
	Button,
	Card,
	FadeIn,
	Input,
	PageHeader,
	Row,
	Select,
	Stack,
	Text,
	Textarea,
} from "@/components";
import { PageLoader } from "@/components/Loader";
import { api, apiData } from "@/constants/api";
import { fetcher } from "@/constants/fetcher";
import { useToast } from "@/hooks/useToast";
import OptionGroupsManager from "@/libs/OptionGroupsManager";
import type { MenuItem, MenuOptionGroup } from "@/types";

const CATEGORIES = [
	{ value: "MEALS", label: "Meals" },
	{ value: "SNACKS", label: "Snacks" },
	{ value: "DRINKS", label: "Drinks" },
	{ value: "BAKED_GOODS", label: "Baked goods" },
];

interface Draft {
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

const BackLink = styled(Link)`
	display: inline-flex;
	align-items: center;
	gap: 6px;
	font-size: 14px;
	font-weight: 600;
	color: var(--pc-text-muted);
	width: fit-content;
	transition: color var(--pc-dur) var(--pc-ease);
	&:hover {
		color: var(--pc-text);
	}
`;

/** Image picker: shows the current/staged image and swaps it on file select. */
const ImagePicker = styled.label`
	display: block;
	cursor: pointer;
	width: fit-content;
`;
const ImageThumb = styled.div<{ $src?: string }>`
	width: 120px;
	height: 120px;
	border-radius: var(--pc-radius);
	background: ${(p) =>
		p.$src
			? `center / cover no-repeat url(${p.$src})`
			: "var(--pc-color-primary-50)"};
	display: grid;
	place-items: center;
	font-size: 40px;
	position: relative;
	overflow: hidden;
	border: 1px solid var(--pc-border);
	transition: border-color var(--pc-dur) var(--pc-ease);
	&:hover {
		border-color: var(--pc-color-primary);
	}
	&::after {
		content: "✎ Change";
		position: absolute;
		inset: auto 0 0 0;
		padding: 4px 0;
		font-size: 11px;
		font-weight: 700;
		text-align: center;
		color: var(--pc-surface);
		background: rgba(0, 0, 0, 0.5);
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
	color: ${(p) => (p.$on ? "var(--pc-color-primary)" : "var(--pc-text-muted)")};
	transition: all var(--pc-dur) var(--pc-ease);
`;
const ManageBtn = styled.button`
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

function errMsg(e: unknown): string {
	const m = (e as { response?: { data?: { message?: string } } })?.response
		?.data?.message;
	return m ?? "Something went wrong. Please try again.";
}

/**
 * Full-page create/edit form for a single menu item. Replaces the old inline
 * modal in `MenuWrapper`. Create (`/menu/new`) and edit (`/menu/[itemId]/edit`)
 * share this component; `itemId` toggles edit mode.
 *
 * Image handling is two-phase because the presign endpoint needs an item id:
 * the picked file is held with a local preview, and only uploaded (presign →
 * PUT → confirm) once the item exists — after the create POST, or straight away
 * against the existing id when editing. This makes the image save atomically
 * with the rest of the form.
 */
export default function MenuItemEditor({ itemId }: { itemId?: string }) {
	const router = useRouter();
	const { toast } = useToast();
	const isEdit = !!itemId;

	// The list primes this cache from `/menu`, so edit mode hydrates without an
	// extra request or a dedicated get-by-id endpoint.
	const { data: items, isLoading: itemsLoading } = useSWR<MenuItem[]>(
		"/menu",
		fetcher,
	);
	const { data: groupsData } = useSWR<MenuOptionGroup[]>(
		"/menu/option-groups",
		fetcher,
	);
	const optionGroups = groupsData ?? [];

	const [draft, setDraft] = useState<Draft>(emptyDraft);
	const [busy, setBusy] = useState(false);
	const [managingGroups, setManagingGroups] = useState(false);
	// A newly picked image file + its object-URL preview (null = keep existing).
	const [imageFile, setImageFile] = useState<File | null>(null);
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);
	const [existingImageUrl, setExistingImageUrl] = useState<
		string | undefined
	>(undefined);

	// Hydrate the form once from the cached item in edit mode.
	const hydrated = useRef(false);
	useEffect(() => {
		if (!isEdit || hydrated.current || !items) return;
		const item = items.find((i) => i.id === itemId);
		if (!item) return;
		hydrated.current = true;
		setDraft({
			name: item.name,
			category: item.category,
			priceNaira: String((item.priceKobo ?? 0) / 100),
			description: item.description ?? "",
			estimatedPrepMin: item.estimatedPrepMin
				? String(item.estimatedPrepMin)
				: "",
			optionGroupIds: item.optionGroupIds ?? [],
		});
		setExistingImageUrl(item.imageUrl);
	}, [isEdit, items, itemId]);

	// Revoke the object URL when it changes or on unmount to avoid a leak.
	useEffect(() => {
		return () => {
			if (previewUrl) URL.revokeObjectURL(previewUrl);
		};
	}, [previewUrl]);

	function pickImage(file: File) {
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		setImageFile(file);
		setPreviewUrl(URL.createObjectURL(file));
	}

	/** presign → PUT → confirm for the given item id. Throws on failure. */
	async function uploadImage(id: string, file: File) {
		const presign = await apiData<{
			uploadUrl: string;
			publicReadUrl: string;
		}>(api.post(`/menu/${id}/image/presign`, { mimeType: file.type }));
		const put = await fetch(presign.uploadUrl, {
			method: "PUT",
			body: file,
			headers: { "Content-Type": file.type },
		});
		if (!put.ok) throw new Error("Upload failed");
		await api.post(`/menu/${id}/image/confirm`, {
			imageUrl: presign.publicReadUrl,
		});
	}

	async function save() {
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

			let id = itemId;
			if (isEdit && id) {
				await api.patch(`/menu/${id}`, body);
			} else {
				// Append new items to the end of the current order.
				body.displayOrder = items?.length ?? 0;
				const created = await apiData<MenuItem>(
					api.post("/menu", body),
				);
				id = created.id;
			}

			// The item is now saved. The image is best-effort: uploading it is a
			// separate call that needs the (now-known) id, and a failure here must
			// NOT strand the user on the create page — retrying would POST a second
			// item. So on image failure we warn but still return to the list; the
			// item is persisted and its photo can be added by editing it.
			let imageFailed = false;
			if (imageFile && id) {
				try {
					await uploadImage(id, imageFile);
				} catch {
					imageFailed = true;
				}
			}

			// Refresh the list's cache before navigating back so the new/edited
			// item shows immediately (a separate page can't mutate the list's
			// own SWR hook the way the old inline modal did).
			await globalMutate("/menu");
			if (imageFailed) {
				toast(
					"Item saved, but the photo couldn't upload. Edit the item to try again.",
					"error",
				);
			} else {
				toast(
					isEdit ? "Menu item updated" : "Menu item added",
					"success",
				);
			}
			router.push("/menu");
		} catch (e) {
			toast(errMsg(e), "error");
			setBusy(false);
		}
	}

	if (isEdit && itemsLoading && !items) return <PageLoader />;

	// Edit mode but the item isn't in the list (bad id / deleted / other vendor).
	if (isEdit && items && !items.find((i) => i.id === itemId)) {
		return (
			<FadeIn>
				<Stack $gap={16}>
					<BackLink href="/menu">← Back to menu</BackLink>
					<Card style={{ textAlign: "center", padding: 40 }}>
						<Stack $gap={8} style={{ alignItems: "center" }}>
							<Text $weight={800} $size={20}>
								Item not found
							</Text>
							<Text $muted>
								This menu item no longer exists. It may have
								been deleted.
							</Text>
							<Button onClick={() => router.push("/menu")}>
								Back to menu
							</Button>
						</Stack>
					</Card>
				</Stack>
			</FadeIn>
		);
	}

	const shownImage = previewUrl ?? existingImageUrl;

	return (
		<FadeIn>
			<Stack $gap={20}>
				<BackLink href="/menu">← Back to menu</BackLink>
				<PageHeader
					eyebrow="Menu"
					title={isEdit ? "Edit item" : "New item"}
					subtitle={
						isEdit
							? "Update this dish's details, price and photo."
							: "Add a dish to your menu with a price and an optional photo."
					}
				/>

				<Card>
					<Stack $gap={16}>
						<Stack $gap={8}>
							<Text $weight={600} $size={14}>
								Photo
							</Text>
							<ImagePicker>
								<ImageThumb $src={shownImage}>
									{shownImage ? "" : "🍲"}
								</ImageThumb>
								<input
									type="file"
									accept="image/jpeg,image/png,image/webp"
									style={{ display: "none" }}
									disabled={busy}
									onChange={(e) => {
										const f = e.target.files?.[0];
										if (f) pickImage(f);
									}}
								/>
							</ImagePicker>
							<Text $muted $size={12}>
								JPG, PNG or WebP. Saved when you tap{" "}
								{isEdit ? "Save changes" : "Add item"}.
							</Text>
						</Stack>

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
								setDraft({ ...draft, category: e.target.value })
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
							min={0}
							step="0.01"
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
							min={1}
							step={1}
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
							<Row $justify="space-between" $align="center">
								<Text $weight={600} $size={14}>
									Option groups
								</Text>
								<ManageBtn
									type="button"
									onClick={() => setManagingGroups(true)}
								>
									Manage
								</ManageBtn>
							</Row>
							{optionGroups.length === 0 ? (
								<Text $muted $size={13}>
									Create reusable choices (e.g. “Protein”)
									with “Manage”, then attach them here so
									buyers can pick when ordering.
								</Text>
							) : (
								<Row $gap={8} $wrap>
									{optionGroups.map((g) => {
										const on =
											draft.optionGroupIds.includes(g.id);
										return (
											<GroupChip
												key={g.id}
												type="button"
												$on={on}
												onClick={() =>
													setDraft({
														...draft,
														optionGroupIds: on
															? draft.optionGroupIds.filter(
																	(x) =>
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

						<Row $gap={8}>
							<Button
								$variant="secondary"
								onClick={() => router.push("/menu")}
								disabled={busy}
							>
								Cancel
							</Button>
							<Button $full $loading={busy} onClick={save}>
								{isEdit ? "Save changes" : "Add item"}
							</Button>
						</Row>
					</Stack>
				</Card>
			</Stack>

			{managingGroups && (
				<OptionGroupsManager onClose={() => setManagingGroups(false)} />
			)}
		</FadeIn>
	);
}
