"use client";

import styled from "styled-components";
import { Badge, Input, Stack, Text } from "@/components";
import type { MenuOptionGroup } from "@/types";

export interface EditableOption {
	name: string;
	priceNaira: string;
}

const Wrap = styled.div`
	padding-left: 36px;
	display: flex;
	flex-direction: column;
	gap: 10px;
	min-width: 0;
	@media (max-width: 640px) {
		padding-left: 0;
	}
`;
const GroupCard = styled.div<{ $on: boolean }>`
	border: 1px solid var(--pc-border);
	border-radius: var(--pc-radius-sm);
	padding: var(--pc-space-3);
	background: ${(p) => (p.$on ? "var(--pc-surface)" : "var(--pc-surface-2)")};
	opacity: ${(p) => (p.$on ? 1 : 0.7)};
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-width: 0;
	overflow: hidden;
	@media (max-width: 640px) {
		padding: 12px;
	}
`;
const Head = styled.div`
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	align-items: center;
	gap: 8px;
	min-width: 0;
	@media (max-width: 520px) {
		grid-template-columns: 1fr;
		align-items: stretch;
	}
`;
const HeadMain = styled.div`
	display: flex;
	align-items: center;
	gap: 8px;
	min-width: 0;
	flex-wrap: wrap;
`;
const GroupName = styled(Text)`
	min-width: 0;
	overflow-wrap: anywhere;
`;
const IncludeToggle = styled.button<{ $on: boolean }>`
	all: unset;
	box-sizing: border-box;
	cursor: pointer;
	font-size: 12px;
	font-weight: 700;
	padding: 5px 10px;
	border-radius: var(--pc-radius-pill);
	border: 1.5px solid
		${(p) => (p.$on ? "var(--pc-color-primary)" : "var(--pc-border)")};
	background: ${(p) =>
		p.$on ? "var(--pc-color-primary-50)" : "var(--pc-surface)"};
	color: ${(p) =>
		p.$on ? "var(--pc-color-primary)" : "var(--pc-text-muted)"};
	flex-shrink: 0;
	text-align: center;
	white-space: nowrap;
	@media (max-width: 520px) {
		justify-self: stretch;
	}
`;
const OptRow = styled.div`
	display: grid;
	grid-template-columns: minmax(0, 1fr) minmax(96px, 120px) 28px;
	gap: 8px;
	align-items: flex-end;
	min-width: 0;
	@media (max-width: 520px) {
		grid-template-columns: minmax(0, 1fr) 86px 28px;
		gap: 8px 6px;
	}
`;
const OptionField = styled.div`
	min-width: 0;
`;
const PriceField = styled.div`
	min-width: 0;
`;
const AddBtn = styled.button`
	all: unset;
	cursor: pointer;
	font-size: 12.5px;
	font-weight: 700;
	color: var(--pc-color-primary);
	padding: 4px 2px;
	align-self: flex-start;
	@media (max-width: 520px) {
		padding: 8px 2px 2px;
	}
`;
const RemoveBtn = styled.button`
	all: unset;
	cursor: pointer;
	color: var(--pc-color-danger);
	font-size: 18px;
	line-height: 1;
	padding: 8px 6px;
	flex-shrink: 0;
	text-align: center;
`;

/** Read-only description of a group's selection rule (edited only in the menu). */
function ruleLabel(g: MenuOptionGroup): string {
	const min = g.required ? Math.max(1, g.minSelect) : g.minSelect;
	if (min > 0 && g.maxSelect === min) return `Required · pick ${min}`;
	if (min > 0 && g.maxSelect != null)
		return `Required · ${min}–${g.maxSelect}`;
	if (min > 0) return `Required · min ${min}`;
	if (g.maxSelect != null) return `Optional · up to ${g.maxSelect}`;
	return "Optional";
}

/** Library options mapped to editable (naira) rows — the seed before any edit. */
export function seedOptions(group: MenuOptionGroup): EditableOption[] {
	return group.options.map((o) => ({
		name: o.name,
		priceNaira: String((o.priceKobo ?? 0) / 100),
	}));
}

/**
 * Per-listing editor for a menu item's attached option groups. Vendors include
 * or exclude each group for this listing and tweak the option names/prices;
 * the group's selection rule (required / min / max) is owned by the menu and
 * shown read-only here. State lives in the parent composer.
 */
export default function ItemGroupsEditor({
	groups,
	excluded,
	edits,
	onToggle,
	onChangeOptions,
}: {
	groups: MenuOptionGroup[];
	excluded: Set<string>;
	edits: Record<string, EditableOption[]>;
	onToggle: (groupId: string) => void;
	onChangeOptions: (groupId: string, options: EditableOption[]) => void;
}) {
	return (
		<Wrap onClick={(e) => e.stopPropagation()}>
			<Text $muted $size={12}>
				Buyer options for this listing
			</Text>
			{groups.map((g) => {
				const on = !excluded.has(g.id);
				const options = edits[g.id] ?? seedOptions(g);
				const change = (next: EditableOption[]) =>
					onChangeOptions(g.id, next);
				return (
					<GroupCard key={g.id} $on={on}>
						<Head>
							<HeadMain>
								<GroupName $weight={700} $size={13.5}>
									{g.name}
								</GroupName>
								<Badge $tone="muted">{ruleLabel(g)}</Badge>
							</HeadMain>
							<IncludeToggle
								type="button"
								$on={on}
								onClick={() => onToggle(g.id)}
							>
								{on ? "✓ Included" : "Excluded"}
							</IncludeToggle>
						</Head>
						{on && (
							<Stack $gap={8}>
								{options.map((o, i) => (
									<OptRow key={`${g.id}-${i}`}>
										<OptionField>
											<Input
												label={i === 0 ? "Option" : ""}
												value={o.name}
												onChange={(e) =>
													change(
														options.map((x, xi) =>
															xi === i
																? {
																		...x,
																		name: e
																			.target
																			.value,
																	}
																: x,
														),
													)
												}
												placeholder="Chicken"
											/>
										</OptionField>
										<PriceField>
											<Input
												label={i === 0 ? "Extra ₦" : ""}
												type="number"
												inputMode="decimal"
												value={o.priceNaira}
												onChange={(e) =>
													change(
														options.map((x, xi) =>
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
													)
												}
												placeholder="0"
											/>
										</PriceField>
										<RemoveBtn
											type="button"
											aria-label="Remove option"
											onClick={() =>
												change(
													options.length > 1
														? options.filter(
																(_, xi) =>
																	xi !== i,
															)
														: options,
												)
											}
										>
											×
										</RemoveBtn>
									</OptRow>
								))}
								<AddBtn
									type="button"
									onClick={() =>
										change([
											...options,
											{ name: "", priceNaira: "" },
										])
									}
								>
									＋ Add option
								</AddBtn>
							</Stack>
						)}
					</GroupCard>
				);
			})}
		</Wrap>
	);
}
