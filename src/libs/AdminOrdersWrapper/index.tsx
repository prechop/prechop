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
	PageHeader,
	Row,
	Select,
	Skeleton,
	Stack,
	StatCard,
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
	"IN_TRANSIT",
	"COMPLETED",
	"CANCELLED",
	"REFUNDED",
];

function tone(
	s: OrderStatus,
): "success" | "warning" | "danger" | "muted" | "primary" {
	if (s === "COMPLETED") return "success";
	if (s === "IN_TRANSIT") return "success";
	if (s === "CANCELLED" || s === "REFUNDED") return "danger";
	if (s === "PENDING_PAYMENT") return "muted";
	return "warning";
}

const Toolbar = styled(Card)`
	display: flex;
	flex-wrap: wrap;
	align-items: flex-end;
	gap: var(--pc-space-4);
`;
const FilterField = styled.div`
	min-width: 220px;
	flex: 1 1 240px;
	max-width: 340px;
`;
const Scroll = styled.div`
	overflow-x: auto;
	border-radius: var(--pc-radius);
`;
const Table = styled.table`
	width: 100%;
	border-collapse: collapse;
	font-size: 14px;
	th,
	td {
		text-align: left;
		padding: 13px 16px;
		white-space: nowrap;
	}
	thead th {
		color: var(--pc-text-muted);
		font-weight: 700;
		font-size: 11.5px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		background: var(--pc-surface-2);
		border-bottom: 1px solid var(--pc-border);
	}
	tbody td {
		border-bottom: 1px solid var(--pc-border);
		color: var(--pc-text);
	}
	tbody tr:last-child td {
		border-bottom: none;
	}
	tbody tr {
		transition: background var(--pc-dur) var(--pc-ease);
	}
	tbody tr:hover td {
		background: var(--pc-surface-2);
	}
`;
const OrderNo = styled.span`
	font-family: var(--pc-font-display);
	font-weight: 800;
	color: var(--pc-text);
`;
const Overlay = styled.div`
	position: fixed;
	inset: 0;
	background: rgba(0, 0, 0, 0.5);
	backdrop-filter: blur(3px);
	display: flex;
	align-items: center;
	justify-content: center;
	padding: var(--pc-space-4);
	z-index: 80;
	animation: pc-fade-up var(--pc-dur) var(--pc-ease) both;
`;
const Modal = styled(Card)`
	width: min(560px, 100%);
	max-height: 90dvh;
	overflow-y: auto;
	box-shadow: var(--pc-shadow-lg);
`;
const KV = styled(Row)`
	justify-content: space-between;
	gap: var(--pc-space-4);
	border-bottom: 1px solid var(--pc-border);
	padding: 10px 0;
	&:last-child {
		border-bottom: none;
	}
`;
const LineItem = styled(Row)`
	justify-content: space-between;
	gap: var(--pc-space-4);
	padding: 8px 0;
`;
const ItemsPanel = styled.div`
	background: var(--pc-surface-2);
	border: 1px solid var(--pc-border);
	border-radius: var(--pc-radius);
	padding: var(--pc-space-3) var(--pc-space-4);
`;

function LoadingTable() {
	return (
		<Card $pad={0}>
			<Stack $gap={0}>
				{[0, 1, 2, 3, 4, 5].map((i) => (
					<Row
						key={i}
						$justify="space-between"
						$align="center"
						style={{
							padding: "16px",
							borderBottom: "1px solid var(--pc-border)",
						}}
					>
						<Skeleton $w="120px" $h={14} />
						<Skeleton $w="90px" $h={14} />
						<Skeleton $w="80px" $h={22} $radius="999px" />
					</Row>
				))}
			</Stack>
		</Card>
	);
}

export default function AdminOrdersWrapper() {
	const [status, setStatus] = useState<string>("");
	const [detailId, setDetailId] = useState<string | null>(null);

	const key = `/admin/orders?limit=50${status ? `&status=${status}` : ""}`;
	const { data, isLoading } = useSWR<BuyerOrder[]>(key);
	const { data: detail } = useSWR<BuyerOrder>(
		detailId ? `/admin/orders/${detailId}` : null,
	);

	const orders = data ?? [];
	const completedCount = orders.filter(
		(o) => o.status === "COMPLETED",
	).length;
	const grossKobo = orders
		.filter((o) => o.status !== "CANCELLED" && o.status !== "REFUNDED")
		.reduce((s, o) => s + o.totalKobo, 0);

	return (
		<Stack $gap={20}>
			<PageHeader
				eyebrow="Admin console"
				title="Orders"
				subtitle="Every order placed on the platform."
			/>

			<FadeIn>
				<Grid $min={200} $gap={16}>
					<StatCard
						label="Orders shown"
						value={orders.length}
						icon="🧾"
						tone="var(--pc-gradient-warm)"
					/>
					<StatCard
						label="Completed"
						value={completedCount}
						icon="✅"
						tone="var(--pc-color-accent)"
					/>
					<StatCard
						label="Gross value"
						value={formatKobo(grossKobo)}
						icon="💳"
						tone="var(--pc-color-primary)"
					/>
				</Grid>
			</FadeIn>

			<Toolbar>
				<FilterField>
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
				</FilterField>
			</Toolbar>

			{isLoading ? (
				<LoadingTable />
			) : orders.length === 0 ? (
				<FadeIn>
					<EmptyState
						icon="🧾"
						title="No orders found"
						description="No orders match this filter yet. Try a different status."
					/>
				</FadeIn>
			) : (
				<FadeIn>
					<Card $pad={0}>
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
											<td>
												<OrderNo>
													{o.orderNumber}
												</OrderNo>
											</td>
											<td>
												{statusLabel(o.fulfillmentType)}
											</td>
											<td>
												<Text $weight={700}>
													{formatKobo(o.totalKobo)}
												</Text>
											</td>
											<td>
												<Badge $tone={tone(o.status)}>
													{statusLabel(o.status)}
												</Badge>
											</td>
											<td>
												<Text $muted $size={13}>
													{formatDateTime(
														o.createdAt,
													)}
												</Text>
											</td>
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
				</FadeIn>
			)}

			{detailId && (
				<Overlay onClick={() => setDetailId(null)}>
					<Modal onClick={(e) => e.stopPropagation()}>
						<Stack $gap={16}>
							<Row $justify="space-between" $align="center">
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
								<Stack $gap={12}>
									{[0, 1, 2, 3, 4].map((i) => (
										<Skeleton key={i} $h={18} />
									))}
								</Stack>
							) : (
								<Stack $gap={16}>
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

									<Stack $gap={8}>
										<Text $weight={700} $size={14}>
											Items
										</Text>
										<ItemsPanel>
											{detail.items.map((it, idx) => (
												<LineItem
													key={`${it.snapshotName}-${idx}`}
												>
													<Text $size={14}>
														<Text
															as="span"
															$weight={700}
														>
															{it.quantity}×
														</Text>{" "}
														{it.snapshotName}
													</Text>
													<Text
														$size={14}
														$weight={600}
													>
														{formatKobo(
															it.subtotalKobo,
														)}
													</Text>
												</LineItem>
											))}
										</ItemsPanel>
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
											<Text $muted>Service fee</Text>
											<Text $weight={600}>
												{formatKobo(
													detail.paymentProcessingFeeKobo ??
														detail.platformFeeKobo,
												)}
											</Text>
										</KV>
										<KV>
											<Text $muted>
												Prechop commission
											</Text>
											<Text $weight={600}>
												{formatKobo(
													detail.prechopCommissionKobo ??
														0,
												)}
											</Text>
										</KV>
										<KV>
											<Text $muted>
												Vendor settlement
											</Text>
											<Text $weight={600}>
												{formatKobo(
													detail.vendorSettlementKobo ??
														detail.totalKobo,
												)}
											</Text>
										</KV>
										<KV>
											<Text $weight={700}>Total</Text>
											<Text $weight={800} $size={16}>
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
