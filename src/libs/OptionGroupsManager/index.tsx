"use client";

import { useState } from "react";
import styled from "styled-components";
import useSWR from "swr";
import {
	Badge,
	Button,
	Card,
	EmptyState,
	Input,
	Row,
	Stack,
	Text,
	Title,
} from "@/components";
import { api } from "@/constants/api";
import { fetcher } from "@/constants/fetcher";
import { formatKobo } from "@/constants/formatters";
import { useToast } from "@/hooks/useToast";
import type { MenuOptionGroup } from "@/types";

interface OptionDraft {
	name: string;
	priceNaira: string;
}
interface GroupDraft {
	id?: string;
	name: string;
	required: boolean;
	minSelect: string;
	maxSelect: string;
	options: OptionDraft[];
}

const emptyGroup: GroupDraft = {
	name: "",
	required: false,
	minSelect: "",
	maxSelect: "",
	options: [{ name: "", priceNaira: "" }],
};

const Overlay = styled.div`
	position: fixed;
	inset: 0;
	z-index: 110;
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
	max-width: 560px;
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
const GroupCard = styled(Card)`
	padding: var(--pc-space-3);
`;
const CheckLabel = styled.label`
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 14px;
	font-weight: 600;
	cursor: pointer;
`;
const OptionRow = styled(Row)`
	gap: 8px;
	align-items: flex-end;
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
const RemoveOpt = styled.button`
	all: unset;
	cursor: pointer;
	color: var(--pc-color-danger);
	font-size: 18px;
	line-height: 1;
	padding: 8px 6px;
	flex-shrink: 0;
`;

function errMsg(e: unknown): string {
	return (
		(e as { response?: { data?: { message?: string } } })?.response?.data
			?.message ?? "Something went wrong. Please try again."
	);
}

function ruleText(g: MenuOptionGroup): string {
	const min = g.required ? Math.max(1, g.minSelect) : g.minSelect;
	if (min > 0 && g.maxSelect === min) return `Required · pick ${min}`;
	if (min > 0 && g.maxSelect != null)
		return `Required · ${min}–${g.maxSelect}`;
	if (min > 0) return `Required · min ${min}`;
	if (g.maxSelect != null) return `Optional · up to ${g.maxSelect}`;
	return "Optional";
}

export default function OptionGroupsManager({
	onClose,
}: {
	onClose: () => void;
}) {
	const { toast } = useToast();
	const { data, mutate } = useSWR<MenuOptionGroup[]>(
		"/menu/option-groups",
		fetcher,
	);
	const [draft, setDraft] = useState<GroupDraft | null>(null);
	const [busy, setBusy] = useState(false);

	const groups = data ?? [];

	function openEdit(g: MenuOptionGroup) {
		setDraft({
			id: g.id,
			name: g.name,
			required: g.required,
			minSelect: g.minSelect ? String(g.minSelect) : "",
			maxSelect: g.maxSelect != null ? String(g.maxSelect) : "",
			options: g.options.map((o) => ({
				name: o.name,
				priceNaira: String((o.priceKobo ?? 0) / 100),
			})),
		});
	}

	async function save() {
		if (!draft) return;
		const options = draft.options
			.map((o) => ({
				name: o.name.trim(),
				priceNaira: Number(o.priceNaira),
			}))
			.filter((o) => o.name.length > 0);
		if (!draft.name.trim()) {
			toast("Give the group a name", "error");
			return;
		}
		if (options.length === 0) {
			toast("Add at least one option", "error");
			return;
		}
		if (options.some((o) => !(o.priceNaira >= 0))) {
			toast("Every option needs a valid price (0 is fine)", "error");
			return;
		}
		const minSelect = draft.minSelect ? Number(draft.minSelect) : 0;
		const maxSelect = draft.maxSelect ? Number(draft.maxSelect) : null;
		if (draft.required && minSelect < 1) {
			toast("A required group must allow at least 1 selection", "error");
			return;
		}
		if (minSelect > options.length) {
			toast("Min selections can't exceed the number of options", "error");
			return;
		}
		if (maxSelect != null && maxSelect < minSelect) {
			toast("Max can't be less than min", "error");
			return;
		}

		const body = {
			name: draft.name.trim(),
			required: draft.required,
			minSelect,
			maxSelect,
			options,
		};
		setBusy(true);
		try {
			if (draft.id) {
				await api.patch(`/menu/option-groups/${draft.id}`, body);
				toast("Option group updated", "success");
			} else {
				await api.post("/menu/option-groups", body);
				toast("Option group added", "success");
			}
			setDraft(null);
			await mutate();
		} catch (e) {
			toast(errMsg(e), "error");
		} finally {
			setBusy(false);
		}
	}

	async function remove(g: MenuOptionGroup) {
		if (!window.confirm(`Delete option group "${g.name}"?`)) return;
		try {
			await api.delete(`/menu/option-groups/${g.id}`);
			toast("Option group deleted", "success");
			await mutate();
		} catch (e) {
			toast(errMsg(e), "error");
		}
	}

	return (
		<Overlay onClick={() => !busy && (draft ? setDraft(null) : onClose())}>
			<Sheet onClick={(e) => e.stopPropagation()}>
				<Handle />
				<Stack $gap={14}>
					<Row $justify="space-between" $align="center">
						<Title $size={18}>
							{draft
								? draft.id
									? "Edit option group"
									: "New option group"
								: "Option groups"}
						</Title>
						<IconBtn
							onClick={() =>
								!busy && (draft ? setDraft(null) : onClose())
							}
						>
							{draft ? "Back" : "Close"}
						</IconBtn>
					</Row>

					{!draft && (
						<>
							<Text $muted $size={13}>
								Reusable choices buyers pick when ordering —
								e.g. “Protein: Chicken / Beef”. Attach them to
								menu items.
							</Text>
							{groups.length === 0 ? (
								<EmptyState
									icon="🧩"
									title="No option groups yet"
									description="Create a group of choices you can attach to menu items."
								/>
							) : (
								<Stack $gap={10}>
									{groups.map((g) => (
										<GroupCard key={g.id}>
											<Stack $gap={8}>
												<Row
													$justify="space-between"
													$align="center"
													$gap={8}
												>
													<Text $weight={700}>
														{g.name}
													</Text>
													<Badge $tone="muted">
														{ruleText(g)}
													</Badge>
												</Row>
												<Row $gap={6} $wrap>
													{g.options.map((o) => (
														<Badge
															key={o.id}
															$tone="primary"
														>
															{o.name}
															{o.priceKobo > 0
																? ` +${formatKobo(o.priceKobo)}`
																: ""}
														</Badge>
													))}
												</Row>
												<Row
													$gap={4}
													$justify="flex-end"
												>
													<IconBtn
														onClick={() =>
															openEdit(g)
														}
													>
														Edit
													</IconBtn>
													<IconBtn
														onClick={() =>
															remove(g)
														}
														style={{
															color: "var(--pc-color-danger)",
														}}
													>
														Delete
													</IconBtn>
												</Row>
											</Stack>
										</GroupCard>
									))}
								</Stack>
							)}
							<Button
								$full
								$variant="secondary"
								onClick={() => setDraft({ ...emptyGroup })}
							>
								＋ New option group
							</Button>
						</>
					)}

					{draft && (
						<Stack $gap={12}>
							<Input
								label="Group name"
								value={draft.name}
								onChange={(e) =>
									setDraft({ ...draft, name: e.target.value })
								}
								placeholder="Protein"
							/>
							<CheckLabel>
								<input
									type="checkbox"
									checked={draft.required}
									onChange={(e) =>
										setDraft({
											...draft,
											required: e.target.checked,
											minSelect:
												e.target.checked &&
												!draft.minSelect
													? "1"
													: draft.minSelect,
										})
									}
								/>
								Required — buyer must choose
							</CheckLabel>
							<Row $gap={10}>
								<Input
									label="Min selections"
									type="number"
									inputMode="numeric"
									value={draft.minSelect}
									onChange={(e) =>
										setDraft({
											...draft,
											minSelect: e.target.value,
										})
									}
									placeholder="0"
								/>
								<Input
									label="Max (blank = any)"
									type="number"
									inputMode="numeric"
									value={draft.maxSelect}
									onChange={(e) =>
										setDraft({
											...draft,
											maxSelect: e.target.value,
										})
									}
									placeholder="Any"
								/>
							</Row>

							<Text $weight={700} $size={14}>
								Options
							</Text>
							<Stack $gap={8}>
								{draft.options.map((o, i) => (
									<OptionRow key={`opt-${i}`}>
										<div style={{ flex: 2 }}>
											<Input
												label={i === 0 ? "Name" : ""}
												value={o.name}
												onChange={(e) =>
													setDraft({
														...draft,
														options:
															draft.options.map(
																(x, xi) =>
																	xi === i
																		? {
																				...x,
																				name: e
																					.target
																					.value,
																			}
																		: x,
															),
													})
												}
												placeholder="Chicken"
											/>
										</div>
										<div style={{ flex: 1 }}>
											<Input
												label={i === 0 ? "Extra ₦" : ""}
												type="number"
												inputMode="decimal"
												value={o.priceNaira}
												onChange={(e) =>
													setDraft({
														...draft,
														options:
															draft.options.map(
																(x, xi) =>
																	xi === i
																		? {
																				...x,
																				priceNaira:
																					e
																						.target
																						.value,
																			}
																		: x,
															),
													})
												}
												placeholder="0"
											/>
										</div>
										<RemoveOpt
											type="button"
											aria-label="Remove option"
											onClick={() =>
												setDraft({
													...draft,
													options:
														draft.options.length > 1
															? draft.options.filter(
																	(_, xi) =>
																		xi !==
																		i,
																)
															: draft.options,
												})
											}
										>
											×
										</RemoveOpt>
									</OptionRow>
								))}
							</Stack>
							<Button
								$variant="secondary"
								$size="sm"
								onClick={() =>
									setDraft({
										...draft,
										options: [
											...draft.options,
											{ name: "", priceNaira: "" },
										],
									})
								}
							>
								＋ Add option
							</Button>

							<Button $full $loading={busy} onClick={save}>
								{draft.id ? "Save group" : "Create group"}
							</Button>
						</Stack>
					)}
				</Stack>
			</Sheet>
		</Overlay>
	);
}
