"use client";

import { useState } from "react";
import styled from "styled-components";
import useSWR, { mutate as globalMutate } from "swr";
import {
	Badge,
	Button,
	Card,
	EmptyState,
	FadeIn,
	PageHeader,
	Row,
	Select,
	Skeleton,
	Stack,
	Text,
} from "@/components";
import { PageLoader } from "@/components/Loader";
import { api } from "@/constants/api";
import { fetcher } from "@/constants/fetcher";
import { formatKobo, statusLabel } from "@/constants/formatters";
import { useToast } from "@/hooks/useToast";
import type { DailyOrder, OrderStatus } from "@/types";

interface PipelineOrder {
	id: string;
	orderNumber: string;
	status: OrderStatus;
	fulfillmentType: "PICKUP" | "DELIVERY";
	totalKobo: number;
	deliveryHostelName?: string;
	deliveryRoomNumber?: string;
	deliveryAdditionalInfo?: string;
	deliveryFullAddress?: string;
	items: Array<{
		snapshotName: string;
		quantity: number;
		subtotalKobo: number;
	}>;
}

// Next action per current status (matches server VALID_TRANSITIONS).
const BASE_NEXT: Partial<
	Record<OrderStatus, { to: OrderStatus; label: string }>
> = {
	PAID: { to: "CONFIRMED", label: "Confirm" },
	CONFIRMED: { to: "PREPARING", label: "Start preparing" },
	PREPARING: { to: "READY", label: "Mark ready" },
	READY: { to: "COMPLETED", label: "Complete" },
	IN_TRANSIT: { to: "COMPLETED", label: "Mark delivered" },
};

// Live columns shown top-to-bottom (mobile-first board).
const COLUMNS: { status: OrderStatus; label: string; icon: string }[] = [
	{ status: "PAID", label: "New", icon: "🔔" },
	{ status: "CONFIRMED", label: "Confirmed", icon: "✅" },
	{ status: "PREPARING", label: "Preparing", icon: "🍳" },
	{ status: "READY", label: "Ready", icon: "🥡" },
];

COLUMNS.push({ status: "IN_TRANSIT", label: "On the way", icon: "->" });

// Presentational lane accent per column (kitchen-board colour coding).
const LANE_ACCENT: Record<string, string> = {
	PAID: "var(--pc-color-gold)",
	CONFIRMED: "var(--pc-color-accent)",
	PREPARING: "var(--pc-color-primary)",
	READY: "var(--pc-color-accent)",
	IN_TRANSIT: "var(--pc-color-gold)",
};

const PipelineShell = styled.div`
	width: 100%;
	max-width: 100%;
	box-sizing: border-box;
	overflow-x: clip;
`;

function statusTone(
	s: OrderStatus,
): "primary" | "success" | "warning" | "danger" | "muted" {
	switch (s) {
		case "PAID":
			return "warning";
		case "READY":
		case "IN_TRANSIT":
		case "COMPLETED":
			return "success";
		case "CANCELLED":
		case "REFUNDED":
			return "danger";
		default:
			return "primary";
	}
}

function nextAction(
	order: PipelineOrder,
): { to: OrderStatus; label: string } | undefined {
	if (order.status === "READY" && order.fulfillmentType === "DELIVERY") {
		return { to: "IN_TRANSIT", label: "Start delivery" };
	}
	return BASE_NEXT[order.status];
}

const Board = styled.div`
	display: grid;
	grid-template-columns: 1fr;
	gap: var(--pc-space-4);
	align-items: start;
	width: 100%;
	max-width: 100%;
	box-sizing: border-box;
	@media (min-width: 720px) {
		grid-template-columns: repeat(2, 1fr);
	}
	@media (min-width: 1080px) {
		grid-template-columns: repeat(5, 1fr);
	}
`;
const Lane = styled.div<{ $accent: string }>`
	display: flex;
	flex-direction: column;
	gap: var(--pc-space-3);
	min-width: 0;
	max-width: 100%;
	background: var(--pc-surface-2);
	border: 1px solid var(--pc-border);
	border-radius: var(--pc-radius);
	padding: var(--pc-space-3);
	border-top: 3px solid ${(p) => p.$accent};
`;
const LaneHead = styled.div`
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--pc-space-2);
	padding: 2px var(--pc-space-1);
`;
const LaneTitle = styled.span`
	display: inline-flex;
	align-items: center;
	gap: 7px;
	font-family: var(--pc-font-display);
	font-weight: 700;
	font-size: 15px;
	color: var(--pc-text);
`;
const OrderCard = styled(Card)`
	padding: var(--pc-space-4);
	&:hover {
		box-shadow: var(--pc-shadow);
	}
`;
const Divider = styled.div`
	height: 1px;
	background: var(--pc-border);
`;
const AddrLine = styled.div`
	display: flex;
	gap: 6px;
	font-size: 13px;
	color: var(--pc-text-muted);
	background: var(--pc-surface-2);
	padding: 8px 10px;
	border-radius: var(--pc-radius-sm);
`;
const CancelBtn = styled.button`
	all: unset;
	cursor: pointer;
	font-size: 13px;
	font-weight: 600;
	color: var(--pc-color-danger);
	&:hover {
		text-decoration: underline;
	}
`;
const LaneEmpty = styled.div`
	text-align: center;
	font-size: 13px;
	color: var(--pc-text-faint);
	padding: var(--pc-space-4) var(--pc-space-2);
	border: 1.5px dashed var(--pc-border);
	border-radius: var(--pc-radius-sm);
`;

function errMsg(e: unknown): string {
	const m = (e as { response?: { data?: { message?: string } } })?.response
		?.data?.message;
	return m ?? "Something went wrong. Please try again.";
}

export default function PipelineWrapper() {
	const { toast } = useToast();
	const { data: dailyOrders, isLoading } = useSWR<DailyOrder[]>(
		"/daily-orders/my-orders?status=ACTIVE&limit=50",
		fetcher,
	);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [busyId, setBusyId] = useState<string | null>(null);

	const active = dailyOrders ?? [];
	const currentId = selectedId ?? active[0]?.id ?? null;

	const {
		data: orders,
		isLoading: ordersLoading,
		mutate,
	} = useSWR<PipelineOrder[]>(
		currentId ? `/vendor/daily-orders/${currentId}/orders` : null,
		fetcher,
		// Keep the kitchen board live as buyers pay/place orders (#17).
		{ refreshInterval: 15_000 },
	);

	if (isLoading) return <PageLoader />;

	if (active.length === 0) {
		return (
			<FadeIn>
				<PipelineShell>
					<Stack $gap={20}>
						<PageHeader
							eyebrow="Live kitchen"
							title="Cooking"
							subtitle="Move orders across the board as you cook and hand off."
						/>
						<EmptyState
							icon="🍳"
							title="No active daily orders"
							description="Post a daily order to start receiving and cooking orders."
						/>
					</Stack>
				</PipelineShell>
			</FadeIn>
		);
	}

	async function advance(o: PipelineOrder) {
		const next = nextAction(o);
		if (!next) return;
		setBusyId(o.id);
		try {
			await api.patch(`/vendor/orders/${o.id}/status`, {
				status: next.to,
			});
			toast(
				`Order ${o.orderNumber} → ${statusLabel(next.to)}`,
				"success",
			);
			await Promise.all([
				mutate(),
				globalMutate("/vendor/orders/incoming"),
			]);
		} catch (e) {
			toast(errMsg(e), "error");
		} finally {
			setBusyId(null);
		}
	}

	async function cancel(o: PipelineOrder) {
		const reason = window.prompt(`Cancel order ${o.orderNumber}? Reason:`);
		if (!reason?.trim()) return;
		setBusyId(o.id);
		try {
			await api.post(`/vendor/orders/${o.id}/cancel`, {
				reason: reason.trim(),
			});
			toast("Order cancelled", "success");
			await Promise.all([
				mutate(),
				globalMutate("/vendor/orders/incoming"),
			]);
		} catch (e) {
			toast(errMsg(e), "error");
		} finally {
			setBusyId(null);
		}
	}

	const list = orders ?? [];
	const liveCount = list.filter((o) =>
		["PAID", "CONFIRMED", "PREPARING", "READY", "IN_TRANSIT"].includes(
			o.status,
		),
	).length;

	return (
		<FadeIn>
			<PipelineShell>
				<Stack $gap={20}>
					<PageHeader
						eyebrow="Live kitchen"
						title="Cooking"
						subtitle="Move orders across the board as you cook and hand off."
						actions={
							liveCount > 0 ? (
								<Badge $tone="primary">
									🔴 {liveCount} live
								</Badge>
							) : undefined
						}
					/>

					<Select
						value={currentId ?? ""}
						onChange={(e) => setSelectedId(e.target.value)}
					>
						{active.map((d) => (
							<option key={d.id} value={d.id}>
								{d.title} · {d.totalOrdersCount} order
								{d.totalOrdersCount === 1 ? "" : "s"}
							</option>
						))}
					</Select>

					{ordersLoading ? (
						<Board>
							{COLUMNS.map((col) => (
								<Lane
									key={col.status}
									$accent={LANE_ACCENT[col.status]}
								>
									<LaneHead>
										<LaneTitle>
											<span aria-hidden>{col.icon}</span>
											{col.label}
										</LaneTitle>
									</LaneHead>
									<OrderCard>
										<Stack $gap={10}>
											<Skeleton $w="55%" $h={14} />
											<Skeleton $w="80%" $h={12} />
											<Skeleton $w="40%" $h={12} />
										</Stack>
									</OrderCard>
								</Lane>
							))}
						</Board>
					) : liveCount === 0 ? (
						<EmptyState
							icon="🧾"
							title="No orders to cook yet"
							description="Paid orders will appear here as buyers order."
						/>
					) : (
						<Board>
							{COLUMNS.map((col) => {
								const colOrders = list.filter(
									(o) => o.status === col.status,
								);
								return (
									<Lane
										key={col.status}
										$accent={LANE_ACCENT[col.status]}
									>
										<LaneHead>
											<LaneTitle>
												<span aria-hidden>
													{col.icon}
												</span>
												{col.label}
											</LaneTitle>
											<Badge
												$tone={statusTone(col.status)}
											>
												{colOrders.length}
											</Badge>
										</LaneHead>
										{colOrders.length === 0 ? (
											<LaneEmpty>Nothing here</LaneEmpty>
										) : (
											colOrders.map((o) => {
												const next = nextAction(o);
												return (
													<OrderCard key={o.id}>
														<Stack $gap={10}>
															<Row
																$justify="space-between"
																$align="flex-start"
																$gap={8}
															>
																<Stack $gap={4}>
																	<Text
																		$weight={
																			700
																		}
																	>
																		#
																		{
																			o.orderNumber
																		}
																	</Text>
																	<Badge
																		$tone={
																			o.fulfillmentType ===
																			"DELIVERY"
																				? "primary"
																				: "muted"
																		}
																	>
																		{o.fulfillmentType ===
																		"DELIVERY"
																			? "🛵 Delivery"
																			: "🥡 Pickup"}
																	</Badge>
																</Stack>
																<Text
																	$weight={
																		800
																	}
																>
																	{formatKobo(
																		o.totalKobo,
																	)}
																</Text>
															</Row>

															<Divider />

															<Stack $gap={3}>
																{o.items.map(
																	(
																		it,
																		idx,
																	) => (
																		<Row
																			key={
																				idx
																			}
																			$gap={
																				8
																			}
																			$align="baseline"
																		>
																			<Text
																				$size={
																					14
																				}
																				$weight={
																					700
																				}
																			>
																				{
																					it.quantity
																				}
																				×
																			</Text>
																			<Text
																				$size={
																					14
																				}
																			>
																				{
																					it.snapshotName
																				}
																			</Text>
																		</Row>
																	),
																)}
															</Stack>

															{o.fulfillmentType ===
																"DELIVERY" && (
																<AddrLine>
																	<span
																		aria-hidden
																	>
																		📍
																	</span>
																	<span>
																		{o.deliveryFullAddress ??
																			[
																				o.deliveryHostelName,
																				o.deliveryRoomNumber,
																				o.deliveryAdditionalInfo,
																			]
																				.filter(
																					Boolean,
																				)
																				.join(
																					", ",
																				) ??
																			"No address"}
																	</span>
																</AddrLine>
															)}

															<Row
																$gap={10}
																$justify="space-between"
																$align="center"
															>
																<CancelBtn
																	onClick={() =>
																		cancel(
																			o,
																		)
																	}
																>
																	Cancel
																</CancelBtn>
																{next && (
																	<Button
																		$size="sm"
																		$loading={
																			busyId ===
																			o.id
																		}
																		onClick={() =>
																			advance(
																				o,
																			)
																		}
																	>
																		{
																			next.label
																		}
																	</Button>
																)}
															</Row>
														</Stack>
													</OrderCard>
												);
											})
										)}
									</Lane>
								);
							})}
						</Board>
					)}
				</Stack>
			</PipelineShell>
		</FadeIn>
	);
}
