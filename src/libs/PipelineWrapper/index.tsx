"use client";

import { useState } from "react";
import styled from "styled-components";
import useSWR from "swr";
import {
	Badge,
	Button,
	Card,
	Row,
	Select,
	Stack,
	Text,
	Title,
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
const NEXT: Partial<Record<OrderStatus, { to: OrderStatus; label: string }>> = {
	PAID: { to: "CONFIRMED", label: "Confirm" },
	CONFIRMED: { to: "PREPARING", label: "Start preparing" },
	PREPARING: { to: "READY", label: "Mark ready" },
	READY: { to: "COMPLETED", label: "Complete" },
};

// Live columns shown top-to-bottom (mobile-first board).
const COLUMNS: { status: OrderStatus; label: string }[] = [
	{ status: "PAID", label: "New" },
	{ status: "CONFIRMED", label: "Confirmed" },
	{ status: "PREPARING", label: "Preparing" },
	{ status: "READY", label: "Ready" },
];

function statusTone(
	s: OrderStatus,
): "primary" | "success" | "warning" | "danger" | "muted" {
	switch (s) {
		case "PAID":
			return "warning";
		case "READY":
		case "COMPLETED":
			return "success";
		case "CANCELLED":
		case "REFUNDED":
			return "danger";
		default:
			return "primary";
	}
}

const Col = styled.div`
	display: flex;
	flex-direction: column;
	gap: 10px;
`;
const OrderCard = styled(Card)`
	padding: var(--pc-space-4);
`;
const Empty = styled(Card)`
	text-align: center;
	padding: var(--pc-space-8) var(--pc-space-5);
`;
const CancelBtn = styled.button`
	all: unset;
	cursor: pointer;
	font-size: 13px;
	font-weight: 600;
	color: var(--pc-color-danger);
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
	);

	if (isLoading) return <PageLoader />;

	if (active.length === 0) {
		return (
			<Stack $gap={16}>
				<Title $size={24}>Cooking</Title>
				<Empty>
					<Stack $gap={6}>
						<Text $weight={700} $size={16}>
							No active daily orders
						</Text>
						<Text $muted>
							Post a daily order to start receiving and cooking
							orders.
						</Text>
					</Stack>
				</Empty>
			</Stack>
		);
	}

	async function advance(o: PipelineOrder) {
		const next = NEXT[o.status];
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
			await mutate();
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
			await mutate();
		} catch (e) {
			toast(errMsg(e), "error");
		} finally {
			setBusyId(null);
		}
	}

	const list = orders ?? [];
	const liveCount = list.filter((o) =>
		["PAID", "CONFIRMED", "PREPARING", "READY"].includes(o.status),
	).length;

	return (
		<Stack $gap={16}>
			<Title $size={24}>Cooking</Title>

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
				<PageLoader />
			) : liveCount === 0 ? (
				<Empty>
					<Stack $gap={6}>
						<Text $weight={700} $size={16}>
							No orders to cook yet
						</Text>
						<Text $muted>
							Paid orders will appear here as buyers order.
						</Text>
					</Stack>
				</Empty>
			) : (
				COLUMNS.map((col) => {
					const colOrders = list.filter(
						(o) => o.status === col.status,
					);
					if (colOrders.length === 0) return null;
					return (
						<Col key={col.status}>
							<Row $gap={8} $align="center">
								<Text $weight={700}>{col.label}</Text>
								<Badge $tone={statusTone(col.status)}>
									{colOrders.length}
								</Badge>
							</Row>
							{colOrders.map((o) => {
								const next = NEXT[o.status];
								return (
									<OrderCard key={o.id}>
										<Stack $gap={10}>
											<Row
												$justify="space-between"
												$align="flex-start"
												$gap={8}
											>
												<Stack $gap={2}>
													<Text $weight={700}>
														#{o.orderNumber}
													</Text>
													<Text $muted $size={12}>
														{o.fulfillmentType ===
														"DELIVERY"
															? "🛵 Delivery"
															: "🥡 Pickup"}
													</Text>
												</Stack>
												<Text $weight={700}>
													{formatKobo(o.totalKobo)}
												</Text>
											</Row>

											<Stack $gap={2}>
												{o.items.map((it, idx) => (
													<Text key={idx} $size={14}>
														{it.quantity}×{" "}
														{it.snapshotName}
													</Text>
												))}
											</Stack>

											{o.fulfillmentType ===
												"DELIVERY" && (
												<Text $muted $size={13}>
													📍{" "}
													{o.deliveryFullAddress ??
														[
															o.deliveryHostelName,
															o.deliveryRoomNumber,
															o.deliveryAdditionalInfo,
														]
															.filter(Boolean)
															.join(", ") ??
														"No address"}
												</Text>
											)}

											<Row
												$gap={10}
												$justify="space-between"
												$align="center"
											>
												<CancelBtn
													onClick={() => cancel(o)}
												>
													Cancel
												</CancelBtn>
												{next && (
													<Button
														$size="sm"
														$loading={
															busyId === o.id
														}
														onClick={() =>
															advance(o)
														}
													>
														{next.label}
													</Button>
												)}
											</Row>
										</Stack>
									</OrderCard>
								);
							})}
						</Col>
					);
				})
			)}
		</Stack>
	);
}
