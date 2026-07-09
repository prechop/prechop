"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import styled from "styled-components";
import useSWR from "swr";
import {
	Badge,
	Button,
	Card,
	FadeIn,
	Input,
	Row,
	SectionHeader,
	Stack,
	Text,
	Textarea,
	Title,
} from "@/components";
import { PageLoader } from "@/components/Loader";
import { api } from "@/constants/api";
import { fetcher } from "@/constants/fetcher";
import { formatDate, formatKobo, timeUntil } from "@/constants/formatters";
import { useAuth } from "@/hooks/Auth/useAuth";
import { useToast } from "@/hooks/useToast";
import type {
	DailyOrder,
	DailyOrderItem,
	DailyOrderOptionGroup,
} from "@/types";

type Fulfillment = "PICKUP" | "DELIVERY";
type Line = { quantity: number; optionIds: Set<string> };

const Wrap = styled(Stack)`
	max-width: 640px;
	margin: 0 auto;
`;
const Hero = styled(Card)`
	padding: 0;
	overflow: hidden;
`;
const Cover = styled.div<{ $src?: string }>`
	position: relative;
	height: 180px;
	background: ${(p) =>
		p.$src
			? `center / cover no-repeat url(${p.$src})`
			: "var(--pc-gradient-hero)"};
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 56px;
	&::after {
		content: "";
		position: absolute;
		inset: 0;
		background: linear-gradient(
			180deg,
			transparent 45%,
			rgba(0, 0, 0, 0.22)
		);
	}
`;
const HeroBody = styled(Stack)`
	padding: var(--pc-space-5);
`;
const Chips = styled(Row)`
	flex-wrap: wrap;
`;
const Chip = styled.span`
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 5px 11px;
	border-radius: var(--pc-radius-pill);
	background: var(--pc-surface-2);
	border: 1px solid var(--pc-border);
	font-size: 12.5px;
	font-weight: 600;
	color: var(--pc-text-muted);
`;
const ItemCard = styled(Card)`
	padding: var(--pc-space-4);
	transition: border-color var(--pc-dur) var(--pc-ease);
	&:hover { border-color: var(--pc-surface-3); }
`;
const SoldOut = styled(ItemCard)`
	opacity: 0.55;
`;
const Thumb = styled.div<{ $src?: string }>`
	width: 52px;
	height: 52px;
	flex: 0 0 auto;
	border-radius: var(--pc-radius-sm);
	background: ${(p) =>
		p.$src
			? `center / cover no-repeat url(${p.$src})`
			: "var(--pc-color-primary-50)"};
	display: grid;
	place-items: center;
	font-size: 24px;
`;
const AddonRow = styled.label`
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 14px;
	color: var(--pc-text-muted);
	cursor: pointer;
	padding: 4px 0;
`;
const AddonBox = styled.div`
	border-top: 1px dashed var(--pc-border);
	padding-top: var(--pc-space-2);
	margin-top: var(--pc-space-1);
`;
const GroupHead = styled(Row)`
	justify-content: space-between;
	align-items: baseline;
	margin-top: var(--pc-space-2);
`;
const GroupRule = styled.span<{ $unmet?: boolean }>`
	font-size: 11.5px;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.02em;
	color: ${(p) =>
		p.$unmet ? "var(--pc-color-danger)" : "var(--pc-text-muted)"};
`;
const Qty = styled(Row)`
	background: var(--pc-surface-2);
	border-radius: var(--pc-radius-pill);
	padding: 3px;
	button {
		width: 32px;
		height: 32px;
		padding: 0;
		font-size: 18px;
		border-radius: 50%;
	}
`;
const FeeRow = styled(Row)`
	justify-content: space-between;
	font-size: 14px;
`;
const Sticky = styled.div`
	position: sticky;
	bottom: 0;
	background: var(--pc-surface);
	border-top: 1px solid var(--pc-border);
	box-shadow: 0 -6px 20px rgba(0, 0, 0, 0.06);
	padding: var(--pc-space-4) 0;
	margin: 0 calc(-1 * var(--pc-space-4));
	padding-left: var(--pc-space-4);
	padding-right: var(--pc-space-4);
`;
const Toggle = styled.button<{ $active: boolean }>`
	flex: 1;
	border: 1.5px solid
		${(p) => (p.$active ? "var(--pc-color-primary)" : "var(--pc-border)")};
	background: ${(p) =>
		p.$active ? "var(--pc-color-primary-50)" : "var(--pc-surface)"};
	color: ${(p) =>
		p.$active ? "var(--pc-color-primary)" : "var(--pc-text-muted)"};
	font-weight: 700;
	padding: 12px;
	border-radius: var(--pc-radius-sm);
	cursor: pointer;
	transition: all var(--pc-dur) var(--pc-ease);
`;

function allOptions(item: DailyOrderItem) {
	return (item.optionGroups ?? []).flatMap((g) => g.options);
}

function lineSubtotal(item: DailyOrderItem, line: Line): number {
	const optionSum = allOptions(item)
		.filter((o) => line.optionIds.has(o.id))
		.reduce((s, o) => s + o.priceKobo, 0);
	return (item.snapshotPriceKobo + optionSum) * line.quantity;
}

/** Effective minimum selections for a group (required ⇒ at least 1). */
function groupMin(group: DailyOrderOptionGroup): number {
	return group.required
		? Math.max(1, group.minSelect ?? 0)
		: (group.minSelect ?? 0);
}

function groupSelectedCount(group: DailyOrderOptionGroup, line: Line): number {
	return group.options.filter((o) => line.optionIds.has(o.id)).length;
}

/** A group is satisfied when its selection count is within [min, max]. */
function groupSatisfied(group: DailyOrderOptionGroup, line: Line): boolean {
	const count = groupSelectedCount(group, line);
	if (count < groupMin(group)) return false;
	if (group.maxSelect != null && count > group.maxSelect) return false;
	return true;
}

/** Every selected item must satisfy all of its required/bounded groups. */
function itemOptionsValid(item: DailyOrderItem, line: Line): boolean {
	return (item.optionGroups ?? []).every((g) => groupSatisfied(g, line));
}

/** Short human hint describing a group's selection rule. */
function ruleLabel(group: DailyOrderOptionGroup, min: number): string {
	if (min > 0 && group.maxSelect === min)
		return min === 1 ? "Required · pick 1" : `Required · pick ${min}`;
	if (min > 0 && group.maxSelect != null)
		return `Required · pick ${min}–${group.maxSelect}`;
	if (min > 0) return `Required · pick at least ${min}`;
	if (group.maxSelect != null) return `Optional · up to ${group.maxSelect}`;
	return "Optional";
}

export default function OrderDetailWrapper({ token }: { token: string }) {
	const router = useRouter();
	const { isAuthenticated, isLoading: authLoading } = useAuth();
	const { toast } = useToast();

	const { data, isLoading } = useSWR<DailyOrder>(
		`/daily-orders/public/${token}`,
		fetcher,
	);

	const [lines, setLines] = useState<Record<string, Line>>({});
	const [fulfillment, setFulfillment] = useState<Fulfillment>("PICKUP");
	const [hostel, setHostel] = useState("");
	const [room, setRoom] = useState("");
	const [extra, setExtra] = useState("");
	const [placing, setPlacing] = useState(false);

	const closed = data ? timeUntil(data.cutoffTime) === "closed" : false;
	const inactive = data ? data.status !== "ACTIVE" : false;
	// "Coming soon": the listing is visible but ordering hasn't opened yet.
	const notStarted = data?.availableFrom
		? new Date(data.availableFrom).getTime() > Date.now()
		: false;

	const { subtotal, itemCount, optionsValid } = useMemo(() => {
		if (!data) return { subtotal: 0, itemCount: 0, optionsValid: true };
		let sub = 0;
		let count = 0;
		let valid = true;
		for (const item of data.items) {
			const line = lines[item.id];
			if (!line || line.quantity <= 0) continue;
			sub += lineSubtotal(item, line);
			count += line.quantity;
			if (!itemOptionsValid(item, line)) valid = false;
		}
		return { subtotal: sub, itemCount: count, optionsValid: valid };
	}, [data, lines]);

	if (isLoading || authLoading) return <PageLoader />;
	if (!data) {
		return (
			<Wrap>
				<Card $accent>
					<Stack $gap={6}>
						<Title $size={18}>Listing not found</Title>
						<Text $muted>
							This listing may have closed or the link is invalid.
						</Text>
					</Stack>
				</Card>
			</Wrap>
		);
	}

	const deliveryFee = fulfillment === "DELIVERY" ? data.deliveryFeeKobo : 0;
	const canOrder =
		!closed && !inactive && !notStarted && itemCount > 0 && optionsValid;

	function setQty(item: DailyOrderItem, delta: number) {
		setLines((prev) => {
			const cur = prev[item.id] ?? { quantity: 0, optionIds: new Set() };
			const next = Math.max(
				0,
				Math.min(item.maxQuantity ?? 50, cur.quantity + delta),
			);
			return { ...prev, [item.id]: { ...cur, quantity: next } };
		});
	}

	/**
	 * Toggle an option within a group. Single-select groups (maxSelect === 1)
	 * behave like radios — picking one clears the group's other choices; picking
	 * the current one again clears it only when the group is optional. Multi-
	 * select groups honour `maxSelect` by ignoring picks past the cap.
	 */
	function toggleOption(
		item: DailyOrderItem,
		group: DailyOrderOptionGroup,
		optionId: string,
	) {
		setLines((prev) => {
			const cur = prev[item.id] ?? { quantity: 1, optionIds: new Set() };
			const ids = new Set(cur.optionIds);
			const groupIds = group.options.map((o) => o.id);
			const single = group.maxSelect === 1;

			if (ids.has(optionId)) {
				if (single && group.required) {
					// keep it selected (radio can't be emptied when required)
				} else {
					ids.delete(optionId);
				}
			} else if (single) {
				for (const gid of groupIds) ids.delete(gid);
				ids.add(optionId);
			} else {
				const count = groupIds.filter((gid) => ids.has(gid)).length;
				if (group.maxSelect == null || count < group.maxSelect)
					ids.add(optionId);
			}
			const quantity = cur.quantity === 0 ? 1 : cur.quantity;
			return { ...prev, [item.id]: { quantity, optionIds: ids } };
		});
	}

	async function checkout() {
		if (!data) return;
		if (!isAuthenticated) {
			router.push(`/login?next=${encodeURIComponent(`/o/${token}`)}`);
			return;
		}
		if (itemCount > 0 && !optionsValid) {
			toast(
				"Please complete the required options on your items.",
				"error",
			);
			return;
		}
		if (!canOrder) return;
		if (fulfillment === "DELIVERY" && (!hostel.trim() || !room.trim())) {
			toast("Add your hostel and room for delivery.", "error");
			return;
		}
		const items = Object.entries(lines)
			.filter(([, l]) => l.quantity > 0)
			.map(([dailyOrderItemId, l]) => ({
				dailyOrderItemId,
				quantity: l.quantity,
				selectedOptionIds: Array.from(l.optionIds),
			}));

		setPlacing(true);
		try {
			const res = await api.post("/orders", {
				dailyOrderId: data.id,
				fulfillmentType: fulfillment,
				...(fulfillment === "DELIVERY"
					? {
							deliveryHostelName: hostel.trim(),
							deliveryRoomNumber: room.trim(),
							deliveryAdditionalInfo: extra.trim() || undefined,
						}
					: {}),
				items,
			});
			const payload = res.data?.data as {
				buyerOrderId: string;
				orderNumber: string;
				paymentUrl: string;
				paystackRef: string;
			};
			// Remember the mapping so the Paystack callback can resolve the order.
			if (typeof window !== "undefined") {
				window.localStorage.setItem(
					`pch-pay-${payload.paystackRef}`,
					JSON.stringify({
						buyerOrderId: payload.buyerOrderId,
						orderNumber: payload.orderNumber,
					}),
				);
			}
			window.location.href = payload.paymentUrl;
		} catch (e) {
			toast(errMsg(e), "error");
			setPlacing(false);
		}
	}

	return (
		<Wrap $gap={16}>
			<FadeIn>
				<Hero>
					<Cover $src={data.items[0]?.snapshotImageUrl}>
						{data.items[0]?.snapshotImageUrl ? "" : "🍲"}
					</Cover>
					<HeroBody $gap={12}>
						<Row
							$justify="space-between"
							$align="flex-start"
							$gap={10}
						>
							<Title $size={24}>{data.title}</Title>
							<Badge
								$tone={
									closed || inactive
										? "danger"
										: notStarted
											? "primary"
											: "warning"
								}
							>
								{inactive
									? "Closed"
									: notStarted
										? `🔜 Starts ${formatDate(data.availableFrom as string)}`
										: closed
											? "Cutoff passed"
											: timeUntil(data.cutoffTime)}
							</Badge>
						</Row>
						<Chips $gap={8}>
							{data.pickupAvailable && <Chip>🥡 Pickup</Chip>}
							{data.deliveryAvailable && (
								<Chip>
									🛵 Delivery{" "}
									{formatKobo(data.deliveryFeeKobo)}
								</Chip>
							)}
						</Chips>
					</HeroBody>
				</Hero>
			</FadeIn>

			<SectionHeader title="Menu" icon="🍽️" />
			<Stack $gap={10}>
				{data.items.map((item) => {
					const line = lines[item.id];
					const qty = line?.quantity ?? 0;
					const listingSoldOut =
						item.maxQuantity != null &&
						item.orderedQuantity >= item.maxQuantity;
					const Wrapper = listingSoldOut ? SoldOut : ItemCard;
					return (
						<Wrapper key={item.id}>
							<Stack $gap={10}>
								<Row
									$justify="space-between"
									$align="center"
									$gap={12}
								>
									<Row $gap={12} $align="center">
										<Thumb
											$src={item.snapshotImageUrl}
											aria-hidden
										>
											{item.snapshotImageUrl ? "" : "🍛"}
										</Thumb>
										<Stack $gap={2}>
											<Text $weight={700}>
												{item.snapshotName}
											</Text>
											<Text $muted $size={13}>
												{formatKobo(
													item.snapshotPriceKobo,
												)}{" "}
												· {item.snapshotPrepMin}m prep
											</Text>
										</Stack>
									</Row>
									{listingSoldOut ? (
										<Badge $tone="danger">Sold out</Badge>
									) : (
										<Qty $gap={6}>
											<Button
												$variant="secondary"
												$size="sm"
												onClick={() => setQty(item, -1)}
												disabled={
													qty === 0 ||
													closed ||
													inactive ||
													notStarted
												}
											>
												−
											</Button>
											<Text
												$weight={700}
												style={{
													minWidth: 18,
													textAlign: "center",
												}}
											>
												{qty}
											</Text>
											<Button
												$variant="secondary"
												$size="sm"
												onClick={() => setQty(item, 1)}
												disabled={
													closed ||
													inactive ||
													notStarted
												}
											>
												＋
											</Button>
										</Qty>
									)}
								</Row>
								{qty > 0 &&
									(item.optionGroups ?? []).length > 0 && (
										<AddonBox>
											<Stack $gap={8}>
												{item.optionGroups.map(
													(group) => {
														const min =
															groupMin(group);
														const satisfied =
															!line ||
															groupSatisfied(
																group,
																line,
															);
														const single =
															group.maxSelect ===
															1;
														return (
															<Stack
																key={group.id}
																$gap={2}
															>
																<GroupHead>
																	<Text
																		$weight={
																			700
																		}
																		$size={
																			13.5
																		}
																	>
																		{
																			group.name
																		}
																	</Text>
																	<GroupRule
																		$unmet={
																			!satisfied
																		}
																	>
																		{ruleLabel(
																			group,
																			min,
																		)}
																	</GroupRule>
																</GroupHead>
																{group.options.map(
																	(o) => {
																		const checked =
																			line?.optionIds.has(
																				o.id,
																			) ??
																			false;
																		const count =
																			line
																				? groupSelectedCount(
																						group,
																						line,
																					)
																				: 0;
																		const capHit =
																			!single &&
																			!checked &&
																			group.maxSelect !=
																				null &&
																			count >=
																				group.maxSelect;
																		return (
																			<AddonRow
																				key={
																					o.id
																				}
																			>
																				<input
																					type={
																						single
																							? "radio"
																							: "checkbox"
																					}
																					name={`grp-${group.id}`}
																					checked={
																						checked
																					}
																					disabled={
																						capHit
																					}
																					onChange={() =>
																						toggleOption(
																							item,
																							group,
																							o.id,
																						)
																					}
																				/>
																				{
																					o.name
																				}
																				{o.priceKobo >
																				0
																					? ` · ${formatKobo(o.priceKobo)}`
																					: ""}
																			</AddonRow>
																		);
																	},
																)}
															</Stack>
														);
													},
												)}
											</Stack>
										</AddonBox>
									)}
							</Stack>
						</Wrapper>
					);
				})}
			</Stack>

			{data.deliveryAvailable && data.pickupAvailable && (
				<Row $gap={10}>
					<Toggle
						$active={fulfillment === "PICKUP"}
						onClick={() => setFulfillment("PICKUP")}
					>
						🥡 Pickup
					</Toggle>
					<Toggle
						$active={fulfillment === "DELIVERY"}
						onClick={() => setFulfillment("DELIVERY")}
					>
						🛵 Delivery
					</Toggle>
				</Row>
			)}

			{fulfillment === "DELIVERY" && (
				<Card>
					<Stack $gap={12}>
						<Text $weight={700}>Delivery details</Text>
						<Input
							label="Hostel / hall"
							value={hostel}
							onChange={(e) => setHostel(e.target.value)}
							placeholder="Kofo Hall"
						/>
						<Input
							label="Room number"
							value={room}
							onChange={(e) => setRoom(e.target.value)}
							placeholder="B12"
						/>
						<Textarea
							label="Extra directions (optional)"
							value={extra}
							onChange={(e) => setExtra(e.target.value)}
							placeholder="Call when you reach the gate"
						/>
					</Stack>
				</Card>
			)}

			<Sticky>
				<Stack $gap={10}>
					{itemCount > 0 && (
						<Stack $gap={4}>
							<FeeRow>
								<Text $muted>Subtotal</Text>
								<Text>{formatKobo(subtotal)}</Text>
							</FeeRow>
							{deliveryFee > 0 && (
								<FeeRow>
									<Text $muted>Delivery</Text>
									<Text>{formatKobo(deliveryFee)}</Text>
								</FeeRow>
							)}
							<Text $muted $size={12}>
								A small service fee is added at checkout.
							</Text>
						</Stack>
					)}
					<Button
						$full
						$size="lg"
						$loading={placing}
						onClick={checkout}
						disabled={!canOrder && isAuthenticated}
					>
						{!isAuthenticated
							? "Log in to order"
							: notStarted
								? `Opens ${formatDate(data.availableFrom as string)}`
								: closed || inactive
									? "Ordering closed"
									: itemCount === 0
										? "Select items"
										: !optionsValid
											? "Complete required options"
											: `Pay ${formatKobo(subtotal + deliveryFee)} →`}
					</Button>
				</Stack>
			</Sticky>
		</Wrap>
	);
}

function errMsg(e: unknown): string {
	const err = e as { response?: { data?: { message?: string } } };
	return err?.response?.data?.message ?? "Something went wrong. Try again.";
}
