"use client";

import { type ComponentType, useEffect, useState } from "react";
import {
	FiCamera,
	FiCheckCircle,
	FiClock,
	FiHash,
	FiMapPin,
	FiPackage,
	FiPhone,
	FiPlayCircle,
	FiTruck,
	FiXCircle,
} from "react-icons/fi";
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
import {
	canonicalOrderStatus,
	isBuyerHandoverEligible,
	nextVendorOrderAction,
} from "@/constants/orderLifecycle";
import { useToast } from "@/hooks/useToast";
import type { DailyOrder, OrderStatus } from "@/types";

interface PipelineOrder {
	id: string;
	orderNumber: string;
	status: OrderStatus;
	fulfillmentType: "PICKUP" | "DELIVERY";
	totalKobo: number;
	deliveryHostelName?: string;
	deliveryPhone?: string;
	deliveryRoomNumber?: string;
	deliveryAdditionalInfo?: string;
	deliveryFullAddress?: string;
	customerMessage?: string;
	acceptanceDeadline?: string | null;
	createdAt?: string;
	updatedAt?: string;
	confirmedAt?: string | null;
	pickedUpAt?: string | null;
	deliveredAt?: string | null;
	handoverCredentialUsedAt?: string | null;
	items: Array<{
		snapshotName: string;
		quantity: number;
		subtotalKobo: number;
	}>;
}

type CompletedFilter = "today" | "7d" | "all";

interface ContactReveal {
	phone?: string;
	telUrl?: string;
	whatsappUrl?: string;
	address?: string;
	instructions?: string[];
}

type LaneKey =
	| "AWAITING_VENDOR_ACCEPTANCE"
	| "ACCEPTED"
	| "COOKING"
	| "READY_FOR_PICKUP"
	| "READY_FOR_DELIVERY"
	| "IN_TRANSIT";

interface BoardColumn {
	key: LaneKey;
	status: OrderStatus;
	label: string;
	empty: string;
	icon: ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
	fulfillmentType?: PipelineOrder["fulfillmentType"];
}

const COLUMNS: BoardColumn[] = [
	{
		key: "AWAITING_VENDOR_ACCEPTANCE",
		status: "AWAITING_VENDOR_ACCEPTANCE",
		label: "Awaiting acceptance",
		empty: "No orders waiting for acceptance",
		icon: FiClock,
	},
	{
		key: "ACCEPTED",
		status: "ACCEPTED",
		label: "Accepted",
		empty: "No accepted orders waiting to cook",
		icon: FiCheckCircle,
	},
	{
		key: "COOKING",
		status: "COOKING",
		label: "Cooking",
		empty: "No orders cooking right now",
		icon: FiPlayCircle,
	},
	{
		key: "READY_FOR_PICKUP",
		status: "READY_FOR_PICKUP",
		label: "Ready for pickup",
		empty: "No pickup orders ready",
		icon: FiPackage,
		fulfillmentType: "PICKUP",
	},
	{
		key: "READY_FOR_DELIVERY",
		status: "READY_FOR_DELIVERY",
		label: "Ready for delivery",
		empty: "No delivery orders ready",
		icon: FiPackage,
		fulfillmentType: "DELIVERY",
	},
	{
		key: "IN_TRANSIT",
		status: "IN_TRANSIT",
		label: "On the way",
		empty: "No delivery orders on the way",
		icon: FiTruck,
		fulfillmentType: "DELIVERY",
	},
];

const LANE_ACCENT: Record<OrderStatus, string> = {
	PENDING_PAYMENT: "var(--pc-color-gold)",
	AWAITING_EXTERNAL_PAYMENT: "var(--pc-color-gold)",
	PAID: "var(--pc-color-gold)",
	AWAITING_VENDOR_ACCEPTANCE: "var(--pc-color-gold)",
	ACCEPTED: "var(--pc-color-accent)",
	CONFIRMED: "var(--pc-color-accent)",
	PREPARING: "var(--pc-color-primary)",
	COOKING: "var(--pc-color-primary)",
	READY: "var(--pc-color-accent)",
	READY_FOR_PICKUP: "var(--pc-color-accent)",
	READY_FOR_DELIVERY: "var(--pc-color-accent)",
	IN_TRANSIT: "var(--pc-color-gold)",
	DELIVERED: "var(--pc-color-accent)",
	PICKED_UP: "var(--pc-color-accent)",
	COMPLETED: "var(--pc-color-success)",
	CANCELLED: "var(--pc-color-danger)",
	VENDOR_REJECTED: "var(--pc-color-danger)",
	EXPIRED_VENDOR_NO_RESPONSE: "var(--pc-color-danger)",
	REFUND_PENDING: "var(--pc-color-gold)",
	REFUND_PROCESSING: "var(--pc-color-gold)",
	REFUNDED: "var(--pc-color-danger)",
	REFUND_FAILED: "var(--pc-color-danger)",
	AWAITING_BUYER_NO_SHOW_RESPONSE: "var(--pc-color-gold)",
	COMPLETED_BUYER_NO_SHOW: "var(--pc-color-danger)",
	PICKUP_PROBLEM_REPORTED: "var(--pc-color-danger)",
	BUYER_UNREACHABLE_REPORTED: "var(--pc-color-danger)",
	DELIVERY_FAILED: "var(--pc-color-danger)",
};

const PipelineShell = styled.div`
	width: 100%;
	max-width: 100%;
	box-sizing: border-box;
	overflow-x: clip;
`;

const Board = styled.div`
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
	gap: var(--pc-space-4);
	align-items: start;
	width: 100%;
	max-width: 100%;
	box-sizing: border-box;
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

const LaneIcon = styled.span`
	display: inline-flex;
	color: var(--pc-color-primary);
`;

const OrderCard = styled(Card)`
	padding: var(--pc-space-4);
	&:hover {
		box-shadow: var(--pc-shadow);
	}
`;

const OrderNumber = styled(Text)`
	overflow-wrap: anywhere;
	word-break: break-word;
	line-height: 1.15;
`;

const Countdown = styled.span`
	display: inline-flex;
	align-items: center;
	gap: 6px;
	font-size: 12px;
	font-weight: 700;
	color: var(--pc-color-gold);
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

const BuyerNoteBox = styled.div`
	display: grid;
	gap: 4px;
	font-size: 13px;
	color: var(--pc-text);
	background: var(--pc-surface-2);
	padding: 9px 10px;
	border: 1px solid var(--pc-border);
	border-radius: var(--pc-radius-sm);
	white-space: pre-wrap;
	overflow-wrap: anywhere;
`;

const ContactBox = styled.div`
	display: grid;
	gap: 8px;
	font-size: 13px;
	color: var(--pc-text);
	background: var(--pc-surface-2);
	padding: 10px;
	border: 1px solid var(--pc-border);
	border-radius: var(--pc-radius-sm);
	overflow-wrap: anywhere;
`;

const LaneEmpty = styled.div`
	text-align: center;
	font-size: 13px;
	color: var(--pc-text-faint);
	padding: var(--pc-space-4) var(--pc-space-2);
	border: 1.5px dashed var(--pc-border);
	border-radius: var(--pc-radius-sm);
`;
const HistoryPanel = styled(Card)`
	padding: var(--pc-space-4);
`;
const FilterRow = styled.div`
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
`;
const FilterButton = styled.button<{ $active: boolean }>`
	border: 1px solid
		${(p) => (p.$active ? "var(--pc-color-primary)" : "var(--pc-border)")};
	background: ${(p) =>
		p.$active ? "var(--pc-color-primary-50)" : "var(--pc-surface-2)"};
	color: ${(p) =>
		p.$active ? "var(--pc-color-primary)" : "var(--pc-text-muted)"};
	border-radius: 999px;
	padding: 7px 12px;
	font-size: 13px;
	font-weight: 800;
	cursor: pointer;
`;
const HistoryList = styled.div`
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
	gap: var(--pc-space-3);
`;

function statusTone(
	status: OrderStatus,
): "primary" | "success" | "warning" | "danger" | "muted" {
	switch (status) {
		case "PAID":
		case "AWAITING_VENDOR_ACCEPTANCE":
		case "REFUND_PENDING":
		case "REFUND_PROCESSING":
		case "AWAITING_BUYER_NO_SHOW_RESPONSE":
			return "warning";
		case "ACCEPTED":
		case "COOKING":
		case "READY":
		case "READY_FOR_PICKUP":
		case "READY_FOR_DELIVERY":
		case "IN_TRANSIT":
		case "PICKED_UP":
		case "DELIVERED":
		case "COMPLETED":
			return "success";
		case "CANCELLED":
		case "REFUNDED":
		case "VENDOR_REJECTED":
		case "EXPIRED_VENDOR_NO_RESPONSE":
		case "REFUND_FAILED":
		case "COMPLETED_BUYER_NO_SHOW":
		case "DELIVERY_FAILED":
			return "danger";
		default:
			return "primary";
	}
}

function errMsg(e: unknown): string {
	const message = (e as { response?: { data?: { message?: string } } })
		?.response?.data?.message;
	return message ?? "Something went wrong. Please try again.";
}

function orderBelongsInColumn(order: PipelineOrder, column: BoardColumn) {
	if (
		canonicalOrderStatus(order.status, order.fulfillmentType) !==
		column.status
	)
		return false;
	if (
		column.fulfillmentType &&
		order.fulfillmentType !== column.fulfillmentType
	) {
		return false;
	}
	return true;
}

function actionForOrder(
	order: PipelineOrder,
): { to: OrderStatus; label: string } | undefined {
	return (
		nextVendorOrderAction(order.status, order.fulfillmentType) ?? undefined
	);
}

function acceptanceCountdown(deadline?: string | null, now = Date.now()) {
	if (!deadline) return null;
	const ms = new Date(deadline).getTime() - now;
	if (!Number.isFinite(ms)) return null;
	if (ms <= 0) return "Acceptance overdue";
	const minutes = Math.floor(ms / 60_000);
	const seconds = Math.floor((ms % 60_000) / 1000);
	return `${minutes}:${String(seconds).padStart(2, "0")} left`;
}

function actionIcon(status: OrderStatus) {
	switch (status) {
		case "ACCEPTED":
		case "COMPLETED":
			return FiCheckCircle;
		case "COOKING":
			return FiPlayCircle;
		case "READY":
		case "READY_FOR_PICKUP":
		case "READY_FOR_DELIVERY":
			return FiPackage;
		case "IN_TRANSIT":
			return FiTruck;
		case "DELIVERED":
			return FiMapPin;
		default:
			return FiClock;
	}
}

function completedAt(order: PipelineOrder) {
	return (
		order.confirmedAt ??
		order.deliveredAt ??
		order.pickedUpAt ??
		order.updatedAt ??
		order.createdAt
	);
}

function completedOrderMatchesFilter(
	order: PipelineOrder,
	filter: CompletedFilter,
	now = Date.now(),
) {
	if (filter === "all") return true;
	const value = completedAt(order);
	if (!value) return true;
	const time = new Date(value).getTime();
	if (!Number.isFinite(time)) return true;
	const start = new Date(now);
	if (filter === "today") {
		start.setHours(0, 0, 0, 0);
		return time >= start.getTime();
	}
	return time >= now - 7 * 24 * 60 * 60 * 1000;
}

function canRevealBuyerContact(order: PipelineOrder) {
	return (
		order.fulfillmentType === "DELIVERY" &&
		[
			"ACCEPTED",
			"CONFIRMED",
			"COOKING",
			"PREPARING",
			"READY",
			"READY_FOR_DELIVERY",
			"IN_TRANSIT",
			"BUYER_UNREACHABLE_REPORTED",
		].includes(order.status)
	);
}

export default function PipelineWrapper() {
	const { toast } = useToast();
	const { data: dailyOrders, isLoading } = useSWR<DailyOrder[]>(
		"/daily-orders/my-orders?status=ACTIVE&limit=50",
		fetcher,
	);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [busyId, setBusyId] = useState<string | null>(null);
	const [now, setNow] = useState(() => Date.now());
	const [completedFilter, setCompletedFilter] =
		useState<CompletedFilter>("today");
	const [contactBusyId, setContactBusyId] = useState<string | null>(null);
	const [buyerContacts, setBuyerContacts] = useState<
		Record<string, ContactReveal>
	>({});

	useEffect(() => {
		const timer = window.setInterval(() => setNow(Date.now()), 1000);
		return () => window.clearInterval(timer);
	}, []);

	const active = dailyOrders ?? [];
	const currentId = selectedId ?? active[0]?.id ?? null;

	const {
		data: orders,
		isLoading: ordersLoading,
		mutate,
	} = useSWR<PipelineOrder[]>(
		currentId ? `/vendor/daily-orders/${currentId}/orders` : null,
		fetcher,
		{ refreshInterval: 15_000 },
	);

	async function advance(order: PipelineOrder) {
		const next = actionForOrder(order);
		if (!next) return;
		setBusyId(order.id);
		try {
			await api.patch(`/vendor/orders/${order.id}/status`, {
				status: next.to,
			});
			toast(
				`Order ${order.orderNumber} -> ${statusLabel(next.to)}`,
				"success",
			);
			await Promise.all([
				mutate(),
				globalMutate("/vendor/orders/incoming"),
				globalMutate(`/orders/${order.id}`),
			]);
		} catch (e) {
			toast(errMsg(e), "error");
		} finally {
			setBusyId(null);
		}
	}

	async function reject(order: PipelineOrder) {
		setBusyId(order.id);
		try {
			await api.patch(`/vendor/orders/${order.id}/status`, {
				status: "VENDOR_REJECTED",
			});
			toast("Order rejected. Refund started.", "success");
			await Promise.all([
				mutate(),
				globalMutate("/vendor/orders/incoming"),
				globalMutate(`/orders/${order.id}`),
			]);
		} catch (e) {
			toast(errMsg(e), "error");
		} finally {
			setBusyId(null);
		}
	}

	async function confirmHandover(order: PipelineOrder, method: "QR" | "PIN") {
		const label = method === "QR" ? "buyer QR code" : "buyer PIN";
		const code = window.prompt(
			method === "QR"
				? `Scan or paste the ${label} for ${order.orderNumber}:`
				: `Enter the ${label} for ${order.orderNumber}:`,
		);
		if (!code?.trim()) return;
		setBusyId(order.id);
		try {
			await api.post(`/vendor/orders/${order.id}/confirm-handover`, {
				method,
				code: code.trim(),
			});
			toast("Handover confirmed.", "success");
			await Promise.all([
				mutate(),
				globalMutate("/vendor/orders/incoming"),
				globalMutate(`/orders/${order.id}`),
			]);
		} catch (e) {
			toast(errMsg(e), "error");
		} finally {
			setBusyId(null);
		}
	}

	function openContactUrl(url?: string) {
		if (!url || typeof window === "undefined") return false;
		window.location.href = url;
		return true;
	}

	async function revealBuyerContact(
		order: PipelineOrder,
		intent: "call" | "whatsapp" | "reveal" = "call",
	) {
		setContactBusyId(order.id);
		try {
			const res = await api.get<{
				data: ContactReveal;
			}>(`/vendor/orders/${order.id}/contact/buyer`);
			const contact = res.data.data;
			setBuyerContacts((current) => ({
				...current,
				[order.id]: contact,
			}));
			const opened =
				intent === "whatsapp"
					? openContactUrl(contact.whatsappUrl)
					: intent === "call"
						? openContactUrl(contact.telUrl)
						: false;
			if (!opened) {
				toast(
					"Buyer contact unlocked for this active order.",
					"success",
				);
			}
		} catch (e) {
			toast(errMsg(e), "error");
		} finally {
			setContactBusyId(null);
		}
	}

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
							icon={<FiPackage size={28} aria-hidden />}
							title="No active daily orders"
							description="Post a daily order to start receiving and cooking orders."
						/>
					</Stack>
				</PipelineShell>
			</FadeIn>
		);
	}

	const list = orders ?? [];
	const completedOrders = list.filter(
		(order) => order.status === "COMPLETED",
	);
	const filteredCompletedOrders = completedOrders
		.filter((order) =>
			completedOrderMatchesFilter(order, completedFilter, now),
		)
		.slice(0, completedFilter === "all" ? 24 : 6);
	const boardCount = list.filter((order) =>
		COLUMNS.some((column) => orderBelongsInColumn(order, column)),
	).length;
	const liveCount = list.filter((order) =>
		COLUMNS.some((column) => orderBelongsInColumn(order, column)),
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
									<FiClock size={14} aria-hidden />{" "}
									{liveCount} live
								</Badge>
							) : undefined
						}
					/>

					<Select
						value={currentId ?? ""}
						onChange={(event) => setSelectedId(event.target.value)}
					>
						{active.map((dailyOrder) => (
							<option key={dailyOrder.id} value={dailyOrder.id}>
								{dailyOrder.title} -{" "}
								{dailyOrder.totalOrdersCount} order
								{dailyOrder.totalOrdersCount === 1 ? "" : "s"}
							</option>
						))}
					</Select>

					{ordersLoading ? (
						<Board>
							{COLUMNS.map((column) => (
								<Lane
									key={column.key}
									$accent={LANE_ACCENT[column.status]}
								>
									<LaneHead>
										<LaneTitle>
											<LaneIcon>
												<column.icon
													size={16}
													aria-hidden
												/>
											</LaneIcon>
											{column.label}
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
					) : boardCount === 0 ? (
						<EmptyState
							icon={<FiClock size={28} aria-hidden />}
							title="No orders to cook yet"
							description="Paid orders will appear here as buyers order."
						/>
					) : (
						<Board>
							{COLUMNS.map((column) => {
								const columnOrders = list.filter((order) =>
									orderBelongsInColumn(order, column),
								);
								return (
									<Lane
										key={column.key}
										$accent={LANE_ACCENT[column.status]}
									>
										<LaneHead>
											<LaneTitle>
												<LaneIcon>
													<column.icon
														size={16}
														aria-hidden
													/>
												</LaneIcon>
												{column.label}
											</LaneTitle>
											<Badge
												$tone={statusTone(
													column.status,
												)}
											>
												{columnOrders.length}
											</Badge>
										</LaneHead>

										{columnOrders.length === 0 ? (
											<LaneEmpty>
												{column.empty}
											</LaneEmpty>
										) : (
											columnOrders.map((order) => {
												const next =
													actionForOrder(order);
												const NextIcon = next
													? actionIcon(next.to)
													: null;
												const handoverEligible =
													isBuyerHandoverEligible(
														order.status,
														order.fulfillmentType,
														order.handoverCredentialUsedAt,
													);
												const countdown =
													acceptanceCountdown(
														order.acceptanceDeadline,
														now,
													);
												const buyerContact =
													buyerContacts[order.id];

												return (
													<OrderCard key={order.id}>
														<Stack $gap={10}>
															<Row
																$justify="space-between"
																$align="flex-start"
																$gap={10}
															>
																<Stack $gap={4}>
																	<OrderNumber
																		$weight={
																			700
																		}
																	>
																		#
																		{
																			order.orderNumber
																		}
																	</OrderNumber>
																	<Badge
																		$tone={
																			order.fulfillmentType ===
																			"DELIVERY"
																				? "primary"
																				: "muted"
																		}
																	>
																		{order.fulfillmentType ===
																		"DELIVERY" ? (
																			<>
																				<FiTruck
																					size={
																						14
																					}
																					aria-hidden
																				/>{" "}
																				Delivery
																			</>
																		) : (
																			<>
																				<FiPackage
																					size={
																						14
																					}
																					aria-hidden
																				/>{" "}
																				Pickup
																			</>
																		)}
																	</Badge>
																	{order.status ===
																		"AWAITING_VENDOR_ACCEPTANCE" &&
																		countdown && (
																			<Countdown>
																				<FiClock
																					size={
																						13
																					}
																					aria-hidden
																				/>
																				{
																					countdown
																				}
																			</Countdown>
																		)}
																</Stack>
																<Text
																	$weight={
																		800
																	}
																>
																	{formatKobo(
																		order.totalKobo,
																	)}
																</Text>
															</Row>

															<Divider />

															<Stack $gap={3}>
																{order.items.map(
																	(
																		item,
																		index,
																	) => (
																		<Row
																			key={
																				index
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
																					item.quantity
																				}
																				x
																			</Text>
																			<Text
																				$size={
																					14
																				}
																			>
																				{
																					item.snapshotName
																				}
																			</Text>
																		</Row>
																	),
																)}
															</Stack>

															{order.fulfillmentType ===
																"DELIVERY" &&
																canRevealBuyerContact(
																	order,
																) &&
																(buyerContact ? (
																	<ContactBox>
																		<Text
																			$size={
																				12
																			}
																			$weight={
																				800
																			}
																		>
																			Buyer
																			contact
																		</Text>
																		{buyerContact.address && (
																			<AddrLine>
																				<FiMapPin
																					size={
																						14
																					}
																					aria-hidden
																				/>
																				<span>
																					{
																						buyerContact.address
																					}
																				</span>
																			</AddrLine>
																		)}
																		{buyerContact.phone && (
																			<Row
																				$gap={
																					8
																				}
																				$align="center"
																			>
																				<FiPhone
																					size={
																						14
																					}
																					aria-hidden
																				/>
																				<a
																					href={
																						buyerContact.telUrl
																					}
																				>
																					Call
																					buyer
																				</a>
																				{buyerContact.whatsappUrl && (
																					<a
																						href={
																							buyerContact.whatsappUrl
																						}
																						target="_blank"
																						rel="noreferrer"
																					>
																						WhatsApp
																					</a>
																				)}
																			</Row>
																		)}
																		{buyerContact.instructions?.map(
																			(
																				instruction,
																			) => (
																				<Text
																					key={
																						instruction
																					}
																					$size={
																						13
																					}
																				>
																					{
																						instruction
																					}
																				</Text>
																			),
																		)}
																	</ContactBox>
																) : (
																	<Button
																		$size="sm"
																		$variant="secondary"
																		$loading={
																			contactBusyId ===
																			order.id
																		}
																		onClick={() =>
																			revealBuyerContact(
																				order,
																			)
																		}
																	>
																		<FiPhone
																			size={
																				14
																			}
																			aria-hidden
																		/>{" "}
																		Call
																		buyer
																	</Button>
																))}

															{order.fulfillmentType !==
																"DELIVERY" &&
																order.customerMessage && (
																	<BuyerNoteBox>
																		<Text
																			$size={
																				12
																			}
																			$weight={
																				800
																			}
																		>
																			Buyer
																			note
																		</Text>
																		<Text
																			$size={
																				13
																			}
																		>
																			{
																				order.customerMessage
																			}
																		</Text>
																	</BuyerNoteBox>
																)}

															<Row
																$gap={10}
																$justify="flex-end"
																$align="center"
															>
																{order.status ===
																"AWAITING_VENDOR_ACCEPTANCE" ? (
																	<>
																		<Button
																			$size="sm"
																			$loading={
																				busyId ===
																				order.id
																			}
																			onClick={() =>
																				advance(
																					order,
																				)
																			}
																		>
																			<FiCheckCircle
																				size={
																					14
																				}
																				aria-hidden
																			/>{" "}
																			Accept
																			order
																		</Button>
																		<Button
																			$size="sm"
																			$variant="danger"
																			$loading={
																				busyId ===
																				order.id
																			}
																			onClick={() =>
																				reject(
																					order,
																				)
																			}
																		>
																			<FiXCircle
																				size={
																					14
																				}
																				aria-hidden
																			/>{" "}
																			Reject
																			order
																		</Button>
																	</>
																) : handoverEligible ? (
																	<>
																		<Button
																			$size="sm"
																			$loading={
																				busyId ===
																				order.id
																			}
																			onClick={() =>
																				confirmHandover(
																					order,
																					"QR",
																				)
																			}
																		>
																			<FiCamera
																				size={
																					14
																				}
																				aria-hidden
																			/>{" "}
																			Scan
																			buyer
																			QR
																		</Button>
																		<Button
																			$size="sm"
																			$variant="secondary"
																			$loading={
																				busyId ===
																				order.id
																			}
																			onClick={() =>
																				confirmHandover(
																					order,
																					"PIN",
																				)
																			}
																		>
																			<FiHash
																				size={
																					14
																				}
																				aria-hidden
																			/>{" "}
																			Enter
																			buyer
																			PIN
																		</Button>
																	</>
																) : next &&
																	NextIcon ? (
																	<Button
																		$size="sm"
																		$loading={
																			busyId ===
																			order.id
																		}
																		onClick={() =>
																			advance(
																				order,
																			)
																		}
																	>
																		<NextIcon
																			size={
																				14
																			}
																			aria-hidden
																		/>{" "}
																		{
																			next.label
																		}
																	</Button>
																) : null}
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

					{completedOrders.length > 0 && (
						<HistoryPanel>
							<Stack $gap={14}>
								<Row
									$justify="space-between"
									$align="center"
									$gap={12}
								>
									<Stack $gap={2}>
										<Text $weight={800}>
											Completed orders
										</Text>
										<Text $muted $size={13}>
											Recent fulfilled orders are kept out
											of the live board.
										</Text>
									</Stack>
									<FilterRow>
										<FilterButton
											type="button"
											$active={
												completedFilter === "today"
											}
											onClick={() =>
												setCompletedFilter("today")
											}
										>
											Today
										</FilterButton>
										<FilterButton
											type="button"
											$active={completedFilter === "7d"}
											onClick={() =>
												setCompletedFilter("7d")
											}
										>
											Last 7 days
										</FilterButton>
										<FilterButton
											type="button"
											$active={completedFilter === "all"}
											onClick={() =>
												setCompletedFilter("all")
											}
										>
											All
										</FilterButton>
									</FilterRow>
								</Row>
								{filteredCompletedOrders.length === 0 ? (
									<LaneEmpty>
										No completed orders in this filter
									</LaneEmpty>
								) : (
									<HistoryList>
										{filteredCompletedOrders.map(
											(order) => (
												<OrderCard key={order.id}>
													<Stack $gap={8}>
														<Row
															$justify="space-between"
															$align="flex-start"
															$gap={10}
														>
															<OrderNumber
																$weight={700}
															>
																#
																{
																	order.orderNumber
																}
															</OrderNumber>
															<Text $weight={800}>
																{formatKobo(
																	order.totalKobo,
																)}
															</Text>
														</Row>
														<Badge $tone="success">
															<FiCheckCircle
																size={14}
																aria-hidden
															/>{" "}
															Completed
														</Badge>
														<Text $muted $size={13}>
															{order.items
																.map(
																	(item) =>
																		`${item.quantity}x ${item.snapshotName}`,
																)
																.join(", ")}
														</Text>
													</Stack>
												</OrderCard>
											),
										)}
									</HistoryList>
								)}
								{completedFilter !== "all" &&
									completedOrders.length > 6 && (
										<Row $justify="flex-end">
											<Button
												$size="sm"
												$variant="secondary"
												onClick={() =>
													setCompletedFilter("all")
												}
											>
												View all completed orders
											</Button>
										</Row>
									)}
							</Stack>
						</HistoryPanel>
					)}
				</Stack>
			</PipelineShell>
		</FadeIn>
	);
}
