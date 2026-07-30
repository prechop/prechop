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
import { api, apiData } from "@/constants/api";
import {
	formatDateTime,
	formatKobo,
	statusLabel,
} from "@/constants/formatters";
import { useAuth } from "@/hooks/Auth/useAuth";
import { useToast } from "@/hooks/useToast";
import { OrderConversationPanel } from "@/libs/OrderConversationPanel";
import type { BuyerOrder, OrderStatus } from "@/types";

interface AdminHandoverDetails {
	orderId: string;
	orderNumber: string;
	status: OrderStatus;
	fulfillmentType: "PICKUP" | "DELIVERY";
	isPaid: boolean;
	paymentVerified?: boolean;
	handoverEligible: boolean;
	qrGenerated: boolean;
	pinGenerated: boolean;
	credentialGeneratedAt?: string | null;
	credentialUsedAt?: string | null;
	failedAttempts: number;
	lockedUntil?: string | null;
	confirmedAt?: string | null;
	confirmedBy?: string | null;
	confirmationMethod?: "QR" | "PIN" | "SUPPORT" | null;
	history: Array<{
		at: string;
		type: string;
		actor?: string;
		actorId?: string;
		note?: string;
	}>;
}

function apiErrorMessage(error: unknown, fallback: string): string {
	if (typeof error === "object" && error !== null && "response" in error) {
		const response = (
			error as { response?: { data?: { message?: unknown } } }
		).response;
		if (typeof response?.data?.message === "string") {
			return response.data.message;
		}
	}
	if (error instanceof Error && error.message) return error.message;
	return fallback;
}

const STATUSES: OrderStatus[] = [
	"PENDING_PAYMENT",
	"PAID",
	"AWAITING_VENDOR_ACCEPTANCE",
	"ACCEPTED",
	"CONFIRMED",
	"COOKING",
	"PREPARING",
	"READY",
	"IN_TRANSIT",
	"AWAITING_BUYER_NO_SHOW_RESPONSE",
	"COMPLETED_BUYER_NO_SHOW",
	"PICKUP_PROBLEM_REPORTED",
	"BUYER_UNREACHABLE_REPORTED",
	"DELIVERY_FAILED",
	"PICKED_UP",
	"DELIVERED",
	"COMPLETED",
	"VENDOR_REJECTED",
	"EXPIRED_VENDOR_NO_RESPONSE",
	"REFUND_PENDING",
	"REFUND_PROCESSING",
	"REFUND_FAILED",
	"CANCELLED",
	"REFUNDED",
];

function tone(
	s: OrderStatus,
): "success" | "warning" | "danger" | "muted" | "primary" {
	if (s === "COMPLETED") return "success";
	if (s === "COMPLETED_BUYER_NO_SHOW") return "success";
	if (s === "IN_TRANSIT") return "success";
	if (s === "PICKED_UP" || s === "DELIVERED") return "success";
	if (
		s === "CANCELLED" ||
		s === "REFUNDED" ||
		s === "VENDOR_REJECTED" ||
		s === "EXPIRED_VENDOR_NO_RESPONSE" ||
		s === "DELIVERY_FAILED" ||
		s === "REFUND_FAILED"
	)
		return "danger";
	if (
		s === "AWAITING_BUYER_NO_SHOW_RESPONSE" ||
		s === "PICKUP_PROBLEM_REPORTED" ||
		s === "BUYER_UNREACHABLE_REPORTED" ||
		s === "REFUND_PROCESSING"
	)
		return "warning";
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
	const { can } = useAuth();
	const { toast } = useToast();
	const [status, setStatus] = useState<string>("");
	const [detailId, setDetailId] = useState<string | null>(null);
	const [revealedPin, setRevealedPin] = useState<string | null>(null);
	const [revealBusy, setRevealBusy] = useState(false);

	const key = `/admin/orders?limit=50${status ? `&status=${status}` : ""}`;
	const { data, isLoading } = useSWR<BuyerOrder[]>(key);
	const { data: detail } = useSWR<BuyerOrder>(
		detailId ? `/admin/orders/${detailId}` : null,
	);
	const { data: handover } = useSWR<AdminHandoverDetails>(
		detailId ? `/admin/orders/${detailId}/handover` : null,
	);

	const orders = data ?? [];
	const completedCount = orders.filter(
		(o) => o.status === "COMPLETED",
	).length;
	const canRevealHandoverPin =
		!!handover?.handoverEligible &&
		handover.paymentVerified !== false &&
		!handover.credentialUsedAt;
	const grossKobo = orders
		.filter((o) => o.status !== "CANCELLED" && o.status !== "REFUNDED")
		.reduce((s, o) => s + o.totalKobo, 0);

	async function revealPin() {
		if (!detailId) return;
		setRevealBusy(true);
		try {
			const result = await apiData<{
				orderId: string;
				orderNumber: string;
				pin: string;
			}>(api.post(`/admin/orders/${detailId}/handover/reveal-pin`));
			setRevealedPin(result.pin);
			toast("PIN revealed and audit logged.", "success");
		} catch (error) {
			toast(apiErrorMessage(error, "Could not reveal PIN."), "error");
		} finally {
			setRevealBusy(false);
		}
	}

	function openDetail(id: string) {
		setRevealedPin(null);
		setDetailId(id);
	}

	function closeDetail() {
		setRevealedPin(null);
		setDetailId(null);
	}

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
														openDetail(o.id)
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
				<Overlay onClick={closeDetail}>
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
									onClick={closeDetail}
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
										{detail.expectedReadyAt && (
											<KV>
												<Text $muted>
													Expected ready
												</Text>
												<Text $weight={600}>
													{formatDateTime(
														detail.expectedReadyAt,
													)}
												</Text>
											</KV>
										)}
										{detail.revisedReadyAt && (
											<KV>
												<Text $muted>
													Revised ready
												</Text>
												<Text $weight={600}>
													{formatDateTime(
														detail.revisedReadyAt,
													)}
												</Text>
											</KV>
										)}
										{detail.expectedPrepMin != null && (
											<KV>
												<Text $muted>
													Prep estimate
												</Text>
												<Text $weight={600}>
													{detail.expectedPrepMin} min
												</Text>
											</KV>
										)}
										{detail.actualPrepMin != null && (
											<KV>
												<Text $muted>Actual prep</Text>
												<Text $weight={600}>
													{detail.actualPrepMin} min
												</Text>
											</KV>
										)}
										{detail.lateMarkedAt && (
											<KV>
												<Text $muted>
													Late handling
												</Text>
												<Row $gap={8} $align="center">
													<Badge $tone="warning">
														Running late
													</Badge>
													<Text $muted $size={12}>
														{detail.readyExtensionCount ??
															0}
														/2 revisions
													</Text>
												</Row>
											</KV>
										)}
										{detail.lateEscalatedAt && (
											<KV>
												<Text $muted>Escalated</Text>
												<Text $weight={600}>
													{formatDateTime(
														detail.lateEscalatedAt,
													)}
												</Text>
											</KV>
										)}
										{detail.adminReviewReason && (
											<KV>
												<Text $muted>
													Review reason
												</Text>
												<Text $weight={600}>
													{detail.adminReviewReason}
												</Text>
											</KV>
										)}
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

									<OrderConversationPanel
										orderId={detail.id}
										admin
										readOnly
										title="Order messages"
									/>

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

									<Card>
										<Stack $gap={12}>
											<Row
												$justify="space-between"
												$align="center"
												$gap={12}
											>
												<Text $weight={800}>
													Handover verification
												</Text>
												{handover?.handoverEligible && (
													<Badge $tone="primary">
														Eligible
													</Badge>
												)}
											</Row>
											{!handover ? (
												<Stack $gap={8}>
													<Skeleton $h={16} />
													<Skeleton $h={16} />
												</Stack>
											) : (
												<Stack $gap={0}>
													<KV>
														<Text $muted>
															QR generated
														</Text>
														<Text $weight={600}>
															{handover.qrGenerated
																? "Yes"
																: "No"}
														</Text>
													</KV>
													<KV>
														<Text $muted>
															PIN generated
														</Text>
														<Text $weight={600}>
															{handover.pinGenerated
																? "Yes"
																: "No"}
														</Text>
													</KV>
													<KV>
														<Text $muted>
															Credential created
														</Text>
														<Text $weight={600}>
															{handover.credentialGeneratedAt
																? formatDateTime(
																		handover.credentialGeneratedAt,
																	)
																: "Not generated"}
														</Text>
													</KV>
													<KV>
														<Text $muted>
															Handover status
														</Text>
														<Text $weight={600}>
															{handover.credentialUsedAt
																? "Used"
																: handover.handoverEligible
																	? "Ready for verification"
																	: "Not available"}
														</Text>
													</KV>
													<KV>
														<Text $muted>
															Payment verified
														</Text>
														<Text $weight={600}>
															{handover.paymentVerified
																? "Yes"
																: "No"}
														</Text>
													</KV>
													<KV>
														<Text $muted>
															Confirmation method
														</Text>
														<Text $weight={600}>
															{handover.confirmationMethod ??
																"Not confirmed"}
														</Text>
													</KV>
													<KV>
														<Text $muted>
															Failed attempts
														</Text>
														<Text $weight={600}>
															{
																handover.failedAttempts
															}
														</Text>
													</KV>
													{handover.lockedUntil && (
														<KV>
															<Text $muted>
																Locked until
															</Text>
															<Text $weight={600}>
																{formatDateTime(
																	handover.lockedUntil,
																)}
															</Text>
														</KV>
													)}
												</Stack>
											)}

											{revealedPin ? (
												<ItemsPanel>
													<Row
														$justify="space-between"
														$align="center"
													>
														<Text $muted>
															Revealed PIN
														</Text>
														<Text
															$weight={800}
															$size={18}
														>
															{revealedPin}
														</Text>
													</Row>
												</ItemsPanel>
											) : can("order:handover:reveal") ? (
												<Stack $gap={8}>
													<Button
														$variant="secondary"
														$size="sm"
														$loading={revealBusy}
														disabled={
															!canRevealHandoverPin
														}
														onClick={revealPin}
													>
														Reveal PIN
													</Button>
													{handover &&
														!canRevealHandoverPin && (
															<Text
																$muted
																$size={13}
															>
																PIN reveal is
																available only
																after payment is
																verified and the
																order reaches
																handover.
															</Text>
														)}
												</Stack>
											) : (
												<Text $muted $size={13}>
													You do not have permission
													to reveal the PIN.
												</Text>
											)}
										</Stack>
									</Card>
								</Stack>
							)}
						</Stack>
					</Modal>
				</Overlay>
			)}
		</Stack>
	);
}
