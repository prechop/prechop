"use client";

import { useState } from "react";
import styled from "styled-components";
import useSWR from "swr";
import {
	Badge,
	Button,
	Card,
	Heading,
	PageLoader,
	Row,
	Select,
	Stack,
	Text,
	Title,
} from "@/components";
import {
	formatDateTime,
	formatKobo,
	statusLabel,
} from "@/constants/formatters";
import type { BuyerOrder, OrderStatus } from "@/types";

const STATUSES: OrderStatus[] = [
	"PENDING_PAYMENT",
	"PAID",
	"CONFIRMED",
	"PREPARING",
	"READY",
	"COMPLETED",
	"CANCELLED",
	"REFUNDED",
];

function tone(
	s: OrderStatus,
): "success" | "warning" | "danger" | "muted" | "primary" {
	if (s === "COMPLETED") return "success";
	if (s === "CANCELLED" || s === "REFUNDED") return "danger";
	if (s === "PENDING_PAYMENT") return "muted";
	return "warning";
}

const Toolbar = styled(Row)`
	margin: var(--pc-space-5) 0 var(--pc-space-4);
	flex-wrap: wrap;
`;
const Scroll = styled.div`
	overflow-x: auto;
`;
const Table = styled.table`
	width: 100%;
	border-collapse: collapse;
	font-size: 14px;
	th, td {
		text-align: left;
		padding: 11px 12px;
		border-bottom: 1px solid var(--pc-border);
		white-space: nowrap;
	}
	th {
		color: var(--pc-text-muted);
		font-weight: 600;
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}
`;
const Overlay = styled.div`
	position: fixed;
	inset: 0;
	background: rgba(0, 0, 0, 0.45);
	display: flex;
	align-items: center;
	justify-content: center;
	padding: var(--pc-space-4);
	z-index: 80;
`;
const Modal = styled(Card)`
	width: min(560px, 100%);
	max-height: 90dvh;
	overflow-y: auto;
`;
const KV = styled(Row)`
	justify-content: space-between;
	border-bottom: 1px solid var(--pc-border);
	padding: 8px 0;
`;
const LineItem = styled(Row)`
	justify-content: space-between;
	padding: 6px 0;
`;

export default function AdminOrdersWrapper() {
	const [status, setStatus] = useState<string>("");
	const [detailId, setDetailId] = useState<string | null>(null);

	const key = `/admin/orders?limit=50${status ? `&status=${status}` : ""}`;
	const { data, isLoading } = useSWR<BuyerOrder[]>(key);
	const { data: detail } = useSWR<BuyerOrder>(
		detailId ? `/admin/orders/${detailId}` : null,
	);

	const orders = data ?? [];

	return (
		<Stack $gap={4}>
			<Heading $size={26}>Orders</Heading>
			<Text $muted>Every order placed on the platform.</Text>

			<Toolbar $gap={12}>
				<div style={{ minWidth: 220 }}>
					<Select
						label="Filter by status"
						value={status}
						onChange={(e) => setStatus(e.target.value)}
					>
						<option value="">All statuses</option>
						{STATUSES.map((s) => (
							<option key={s} value={s}>
								{statusLabel(s)}
							</option>
						))}
					</Select>
				</div>
			</Toolbar>

			{isLoading ? (
				<PageLoader />
			) : orders.length === 0 ? (
				<Card>
					<Text $muted style={{ textAlign: "center" }}>
						No orders found.
					</Text>
				</Card>
			) : (
				<Card style={{ padding: 0 }}>
					<Scroll>
						<Table>
							<thead>
								<tr>
									<th>Order #</th>
									<th>Fulfilment</th>
									<th>Total</th>
									<th>Status</th>
									<th>Placed</th>
									<th></th>
								</tr>
							</thead>
							<tbody>
								{orders.map((o) => (
									<tr key={o.id}>
										<td>{o.orderNumber}</td>
										<td>
											{statusLabel(o.fulfillmentType)}
										</td>
										<td>{formatKobo(o.totalKobo)}</td>
										<td>
											<Badge $tone={tone(o.status)}>
												{statusLabel(o.status)}
											</Badge>
										</td>
										<td>{formatDateTime(o.createdAt)}</td>
										<td>
											<Button
												$variant="ghost"
												$size="sm"
												onClick={() =>
													setDetailId(o.id)
												}
											>
												View
											</Button>
										</td>
									</tr>
								))}
							</tbody>
						</Table>
					</Scroll>
				</Card>
			)}

			{detailId && (
				<Overlay onClick={() => setDetailId(null)}>
					<Modal onClick={(e) => e.stopPropagation()}>
						<Stack $gap={12}>
							<Row $justify="space-between">
								<Title $size={18}>
									{detail
										? `Order ${detail.orderNumber}`
										: "Order"}
								</Title>
								<Button
									$variant="ghost"
									$size="sm"
									onClick={() => setDetailId(null)}
								>
									Close
								</Button>
							</Row>
							{!detail ? (
								<PageLoader />
							) : (
								<Stack $gap={14}>
									<Stack $gap={0}>
										<KV>
											<Text $muted>Status</Text>
											<Badge $tone={tone(detail.status)}>
												{statusLabel(detail.status)}
											</Badge>
										</KV>
										<KV>
											<Text $muted>Fulfilment</Text>
											<Text $weight={600}>
												{statusLabel(
													detail.fulfillmentType,
												)}
											</Text>
										</KV>
										<KV>
											<Text $muted>Placed</Text>
											<Text $weight={600}>
												{formatDateTime(
													detail.createdAt,
												)}
											</Text>
										</KV>
									</Stack>

									<Stack $gap={6}>
										<Text $weight={700} $size={14}>
											Items
										</Text>
										{detail.items.map((it, idx) => (
											<LineItem
												key={`${it.snapshotName}-${idx}`}
											>
												<Text $size={14}>
													{it.quantity}×{" "}
													{it.snapshotName}
												</Text>
												<Text $size={14} $weight={600}>
													{formatKobo(
														it.subtotalKobo,
													)}
												</Text>
											</LineItem>
										))}
									</Stack>

									<Stack $gap={0}>
										<KV>
											<Text $muted>Subtotal</Text>
											<Text $weight={600}>
												{formatKobo(
													detail.subtotalKobo,
												)}
											</Text>
										</KV>
										<KV>
											<Text $muted>Delivery fee</Text>
											<Text $weight={600}>
												{formatKobo(
													detail.deliveryFeeKobo,
												)}
											</Text>
										</KV>
										<KV>
											<Text $muted>Platform fee</Text>
											<Text $weight={600}>
												{formatKobo(
													detail.platformFeeKobo,
												)}
											</Text>
										</KV>
										<KV>
											<Text $weight={700}>Total</Text>
											<Text $weight={800}>
												{formatKobo(detail.totalKobo)}
											</Text>
										</KV>
									</Stack>
								</Stack>
							)}
						</Stack>
					</Modal>
				</Overlay>
			)}
		</Stack>
	);
}
