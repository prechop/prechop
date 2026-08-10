"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";
import {
	Badge,
	Button,
	Card,
	PageHeader,
	Row,
	SectionHeader,
	Select,
	Stack,
	Text,
	Textarea,
} from "@/components";
import { api } from "@/constants/api";
import { fetcher } from "@/constants/fetcher";
import {
	formatDateTime,
	formatKobo,
	statusLabel,
} from "@/constants/formatters";
import { useAuth } from "@/hooks/Auth/useAuth";
import { useToast } from "@/hooks/useToast";

type SupportStatus = "OPEN" | "PENDING_USER" | "RESOLVED" | "CLOSED";

interface SupportRequest {
	id: string;
	userId: string;
	senderRole: "BUYER" | "VENDOR" | "ADMIN";
	category: string;
	subject: string;
	status: SupportStatus;
	assignedAdminId?: string;
	resolutionNote?: string;
	relatedOrderRef?: string;
	relatedPaymentRef?: string;
	createdAt: string;
	updatedAt: string;
	messages: Array<{
		id: string;
		senderId: string;
		senderRole: "BUYER" | "VENDOR" | "ADMIN";
		body: string;
		createdAt: string;
	}>;
}

interface SupportOrderContext {
	order: {
		id: string;
		orderNumber: string;
		status: string;
		fulfillmentType: "PICKUP" | "DELIVERY";
		totalKobo: number;
		createdAt: string;
		timeline: Array<{
			at: string;
			type: string;
			actor?: string;
			note?: string;
		}>;
	};
	payment: null | {
		status: string;
		webhookVerified: boolean;
		paidAt?: string;
	};
	vendor: null | { id: string; name: string; status: string };
	buyer: null | { id: string; name: string; email: string };
	handover: {
		confirmed: boolean;
		confirmedAt?: string | null;
		method?: string | null;
		credentialUsedAt?: string | null;
		failedAttempts: number;
		lockedUntil?: string | null;
	};
}

const STATUSES: Array<{ value: "" | SupportStatus; label: string }> = [
	{ value: "", label: "All" },
	{ value: "OPEN", label: "Open" },
	{ value: "PENDING_USER", label: "Pending user" },
	{ value: "RESOLVED", label: "Resolved" },
	{ value: "CLOSED", label: "Closed" },
];

function tone(status: SupportStatus) {
	if (status === "OPEN") return "primary";
	if (status === "PENDING_USER") return "warning";
	if (status === "RESOLVED") return "success";
	return "muted";
}

export default function AdminSupportWrapper() {
	const { can } = useAuth();
	const { toast } = useToast();
	const [status, setStatus] = useState<"" | SupportStatus>("");
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [reply, setReply] = useState("");
	const [busy, setBusy] = useState(false);
	const [resolutionNote, setResolutionNote] = useState("");
	const [disputeReason, setDisputeReason] = useState("NON_DELIVERY");
	const [pinAction, setPinAction] = useState("");
	const [pinReason, setPinReason] = useState("");
	const [pinMessage, setPinMessage] = useState("");
	const key = status
		? `/admin/support-requests?status=${status}`
		: "/admin/support-requests";
	const { data, isLoading, mutate } = useSWR<SupportRequest[]>(key, fetcher, {
		refreshInterval: 10_000,
	});
	const requests = data ?? [];
	const selected = requests.find((r) => r.id === selectedId) ?? requests[0];
	const isOrderRequest =
		selected?.category === "ORDER" && !!selected.relatedOrderRef;
	const { data: orderContext, mutate: refreshOrder } =
		useSWR<SupportOrderContext>(
			isOrderRequest && can("order:read")
				? `/admin/support-requests/${selected.id}/order`
				: null,
			fetcher,
		);

	useEffect(() => {
		setResolutionNote(selected?.resolutionNote ?? "");
	}, [selected?.resolutionNote]);

	function isPinResetRequest(request: SupportRequest) {
		return (
			request.category === "VENDOR_ACCOUNT" &&
			request.subject === "Vendor PIN reset request"
		);
	}

	const pinReset = selected && isPinResetRequest(selected);

	async function refreshSupportLists() {
		await Promise.all([mutate(), mutate("/admin/support-requests" as any)]);
	}

	async function sendReply() {
		if (!selected || !reply.trim()) return;
		setBusy(true);
		try {
			await api.post(`/admin/support-requests/${selected.id}/messages`, {
				message: reply.trim(),
			});
			setReply("");
			toast("Reply sent", "success");
			await refreshSupportLists();
		} catch {
			toast("Could not send reply", "error");
		} finally {
			setBusy(false);
		}
	}

	async function updateStatus(next: SupportStatus) {
		if (!selected) return;
		setBusy(true);
		try {
			await api.patch(`/admin/support-requests/${selected.id}`, {
				status: next,
				...(next === "RESOLVED"
					? { resolutionNote: resolutionNote.trim() }
					: {}),
			});
			toast("Support request updated", "success");
			await refreshSupportLists();
		} catch {
			toast("Could not update request", "error");
		} finally {
			setBusy(false);
		}
	}

	async function refundOrder() {
		if (!orderContext || resolutionNote.trim().length < 10) return;
		setBusy(true);
		try {
			await api.post(`/admin/orders/${orderContext.order.id}/refund`, {
				reason: resolutionNote.trim(),
			});
			toast("Order refund submitted", "success");
			await refreshOrder();
		} catch {
			toast("Could not refund order", "error");
		} finally {
			setBusy(false);
		}
	}

	async function openDispute() {
		if (!orderContext || resolutionNote.trim().length < 10) return;
		setBusy(true);
		try {
			await api.post(`/admin/orders/${orderContext.order.id}/disputes`, {
				reason: disputeReason,
				buyerNotes: [resolutionNote.trim()],
			});
			toast("Dispute opened for review", "success");
		} catch {
			toast("Could not open dispute", "error");
		} finally {
			setBusy(false);
		}
	}

	async function assignToMe() {
		if (!selected) return;
		setBusy(true);
		try {
			await api.patch(`/admin/support-requests/${selected.id}`, {
				assignedAdminId: "me",
			});
			toast("Assigned", "success");
			await refreshSupportLists();
		} catch {
			toast("Could not assign request", "error");
		} finally {
			setBusy(false);
		}
	}

	async function submitPinAction() {
		if (!selected || !pinAction) return;
		setBusy(true);
		try {
			const payload: Record<string, unknown> = { action: pinAction };
			if (pinAction === "reject") {
				payload.reason = pinReason;
				payload.supportRequestId = selected.id;
			}
			if (pinAction === "request-info") {
				payload.message = pinMessage;
				payload.supportRequestId = selected.id;
			}
			await api.post(
				`/admin/vendors/pin-reset/${encodeURIComponent(selected.userId)}`,
				payload,
			);
			setPinAction("");
			setPinReason("");
			setPinMessage("");
			toast("Action completed", "success");
			await refreshSupportLists();
		} catch {
			toast("Action failed", "error");
		} finally {
			setBusy(false);
		}
	}

	return (
		<Stack $gap={20}>
			<PageHeader
				eyebrow="Support"
				title="Support requests"
				subtitle="View, reply to, assign and update user support conversations."
			/>
			<Row $gap={12} $align="flex-start" $wrap>
				<Card style={{ flex: "1 1 320px" }}>
					<Stack $gap={12}>
						<SectionHeader title="Inbox" icon="?" />
						<Select
							value={status}
							onChange={(e) =>
								setStatus(e.target.value as "" | SupportStatus)
							}
						>
							{STATUSES.map((s) => (
								<option key={s.label} value={s.value}>
									{s.label}
								</option>
							))}
						</Select>
						{isLoading && <Text $muted>Loading requests...</Text>}
						{requests.map((request) => (
							<Button
								key={request.id}
								$variant={
									selected?.id === request.id
										? "secondary"
										: "ghost"
								}
								onClick={() => setSelectedId(request.id)}
								style={{
									justifyContent: "flex-start",
									textAlign: "left",
								}}
							>
								<Stack $gap={2}>
									<Row $gap={8} $align="center" $wrap>
										<Text $weight={800}>
											{request.subject}
										</Text>
										<Badge $tone={tone(request.status)}>
											{request.status}
										</Badge>
									</Row>
									<Text $muted $size={12}>
										{request.senderRole} ·{" "}
										{request.category} ·{" "}
										{formatDateTime(request.updatedAt)}
									</Text>
								</Stack>
							</Button>
						))}
						{!isLoading && requests.length === 0 && (
							<Text $muted>No support requests here.</Text>
						)}
					</Stack>
				</Card>
				<Card style={{ flex: "2 1 520px" }}>
					{selected ? (
						<Stack $gap={14}>
							<Row $justify="space-between" $align="center" $wrap>
								<Stack $gap={3}>
									<Text $weight={900} $size={20}>
										{selected.subject}
									</Text>
									<Text $muted $size={13}>
										{selected.senderRole} ·{" "}
										{selected.category} · account{" "}
										{selected.userId}
									</Text>
								</Stack>
								<Badge $tone={tone(selected.status)}>
									{selected.status}
								</Badge>
							</Row>
							{(selected.relatedOrderRef ||
								selected.relatedPaymentRef) && (
								<Text $muted $size={13}>
									{selected.relatedOrderRef
										? `Order: ${selected.relatedOrderRef}`
										: ""}
									{selected.relatedOrderRef &&
									selected.relatedPaymentRef
										? " · "
										: ""}
									{selected.relatedPaymentRef
										? `Payment: ${selected.relatedPaymentRef}`
										: ""}
								</Text>
							)}
							{isOrderRequest &&
								can("order:read") &&
								orderContext && (
									<Card>
										<Stack $gap={12}>
											<Row
												$justify="space-between"
												$align="center"
												$wrap
											>
												<Stack $gap={2}>
													<Text $weight={900}>
														Linked order{" "}
														{
															orderContext.order
																.orderNumber
														}
													</Text>
													<Text $muted $size={12}>
														Placed{" "}
														{formatDateTime(
															orderContext.order
																.createdAt,
														)}
													</Text>
												</Stack>
												<Button
													as={Link}
													href={`/admin/orders?orderId=${encodeURIComponent(orderContext.order.id)}`}
													$variant="secondary"
													$size="sm"
												>
													View order
												</Button>
											</Row>
											<Row $gap={8} $wrap>
												<Badge $tone="primary">
													{statusLabel(
														orderContext.order
															.status,
													)}
												</Badge>
												<Badge
													$tone={
														orderContext.payment
															?.status ===
															"SUCCESS" &&
														orderContext.payment
															.webhookVerified
															? "success"
															: "warning"
													}
												>
													Payment:{" "}
													{orderContext.payment
														?.status ??
														"No payment"}
													{orderContext.payment
														? orderContext.payment
																.webhookVerified
															? " · verified"
															: " · unverified"
														: ""}
												</Badge>
												<Badge $tone="muted">
													{
														orderContext.order
															.fulfillmentType
													}
												</Badge>
												<Badge
													$tone={
														orderContext.handover
															.confirmed
															? "success"
															: "warning"
													}
												>
													Handover:{" "}
													{orderContext.handover
														.confirmed
														? "confirmed"
														: "not confirmed"}
												</Badge>
											</Row>
											<Text $size={13}>
												<strong>Vendor:</strong>{" "}
												{orderContext.vendor?.name ??
													"Unknown"}
												{orderContext.vendor
													? ` (${orderContext.vendor.status})`
													: ""}
											</Text>
											<Text $size={13}>
												<strong>Buyer:</strong>{" "}
												{orderContext.buyer?.name ??
													"Unknown"}
												{orderContext.buyer
													? ` · ${orderContext.buyer.email}`
													: ""}
											</Text>
											<Text $size={13}>
												<strong>Total:</strong>{" "}
												{formatKobo(
													orderContext.order
														.totalKobo,
												)}
												{orderContext.handover
													.confirmedAt
													? ` · ${orderContext.handover.method ?? "Handover"} at ${formatDateTime(orderContext.handover.confirmedAt)}`
													: ""}
											</Text>
											<Stack $gap={6}>
												<Text $weight={800} $size={13}>
													Order timeline
												</Text>
												{orderContext.order.timeline
													.slice()
													.reverse()
													.map((entry, index) => (
														<Text
															key={`${entry.at}-${entry.type}-${index}`}
															$muted
															$size={12}
														>
															{formatDateTime(
																entry.at,
															)}{" "}
															·{" "}
															{statusLabel(
																entry.type,
															)}
															{entry.actor
																? ` · ${entry.actor}`
																: ""}
															{entry.note
																? ` · ${entry.note}`
																: ""}
														</Text>
													))}
												{orderContext.order.timeline
													.length === 0 && (
													<Text $muted $size={12}>
														No timeline entries
														recorded.
													</Text>
												)}
											</Stack>
											{can("support:update") && (
												<Select
													value={disputeReason}
													onChange={(e) =>
														setDisputeReason(
															e.target.value,
														)
													}
												>
													<option value="NON_DELIVERY">
														Non-delivery
													</option>
													<option value="FAILED_DELIVERY">
														Failed delivery
													</option>
													<option value="WRONG_ITEM">
														Wrong item
													</option>
													<option value="MISSING_ITEM">
														Missing item
													</option>
													<option value="QUALITY_COMPLAINT">
														Quality complaint
													</option>
													<option value="VENDOR_UNAVAILABLE">
														Vendor unavailable
													</option>
													<option value="REFUND_FAILURE">
														Refund failure
													</option>
												</Select>
											)}
											<Row $gap={8} $wrap>
												{can("refund:create") && (
													<Button
														$variant="danger"
														$size="sm"
														onClick={refundOrder}
														disabled={
															busy ||
															resolutionNote.trim()
																.length < 10
														}
													>
														Refund order
													</Button>
												)}
												{can("support:update") && (
													<Button
														$variant="secondary"
														$size="sm"
														onClick={openDispute}
														disabled={
															busy ||
															resolutionNote.trim()
																.length < 10
														}
													>
														Open dispute review
													</Button>
												)}
												{can("vendor:suspend") &&
													orderContext.vendor && (
														<Button
															as={Link}
															href={`/admin/vendors?highlight=${encodeURIComponent(orderContext.vendor.id)}`}
															$variant="ghost"
															$size="sm"
														>
															Review vendor /
															suspend
														</Button>
													)}
											</Row>
										</Stack>
									</Card>
								)}
							{isOrderRequest && !can("order:read") && (
								<Text $muted $size={13}>
									You do not have permission to view linked
									order details.
								</Text>
							)}
							<Stack $gap={10}>
								{selected.messages.map((message) => (
									<Card key={message.id}>
										<Stack $gap={4}>
											<Text $weight={800} $size={13}>
												{message.senderRole} ·{" "}
												{formatDateTime(
													message.createdAt,
												)}
											</Text>
											<Text $size={14}>
												{message.body}
											</Text>
										</Stack>
									</Card>
								))}
							</Stack>
							<Textarea
								value={reply}
								onChange={(e) => setReply(e.target.value)}
								placeholder="Write a reply..."
								rows={4}
							/>
							{can("support:update") && (
								<Stack $gap={5}>
									<Textarea
										value={resolutionNote}
										onChange={(e) =>
											setResolutionNote(e.target.value)
										}
										placeholder="Required resolution note: record what was verified and what action was taken."
										rows={3}
									/>
									<Text $muted $size={12}>
										A chat reply is not a resolution. Record
										the operational outcome before resolving
										or taking an order action.
									</Text>
								</Stack>
							)}
							<Row $gap={10} $wrap>
								{can("support:reply") && (
									<Button
										onClick={sendReply}
										$loading={busy}
										disabled={busy || !reply.trim()}
									>
										Send reply
									</Button>
								)}
								{can("support:update") && (
									<Button
										$variant="secondary"
										onClick={() => updateStatus("RESOLVED")}
										disabled={
											busy ||
											resolutionNote.trim().length < 10
										}
									>
										Mark resolved
									</Button>
								)}
								{can("support:update") && (
									<Button
										$variant="ghost"
										onClick={() => updateStatus("CLOSED")}
										disabled={busy}
									>
										Close
									</Button>
								)}
								{can("support:update") && (
									<Button
										$variant="ghost"
										onClick={assignToMe}
										disabled={busy}
									>
										Assign to me
									</Button>
								)}
							</Row>

							{pinReset && (
								<Card>
									<Stack $gap={10}>
										<Text $weight={700}>
											PIN reset actions
										</Text>
										<Text $muted $size={13}>
											This is a manual PIN recovery
											request. Verify the vendor's
											identity before taking action.
										</Text>
										<Select
											value={pinAction}
											onChange={(e) =>
												setPinAction(e.target.value)
											}
										>
											<option value="">
												Select action...
											</option>
											<option value="approve">
												Approve identity
											</option>
											<option value="request-info">
												Request more info
											</option>
											<option value="reject">
												Reject request
											</option>
											<option value="revoke">
												Revoke authorization
											</option>
										</Select>
										{pinAction === "reject" && (
											<Textarea
												value={pinReason}
												onChange={(e) =>
													setPinReason(e.target.value)
												}
												placeholder="Reason for rejection (visible to vendor)"
												rows={3}
											/>
										)}
										{pinAction === "request-info" && (
											<Textarea
												value={pinMessage}
												onChange={(e) =>
													setPinMessage(
														e.target.value,
													)
												}
												placeholder="What additional information do you need?"
												rows={3}
											/>
										)}
										<Button
											onClick={submitPinAction}
											$loading={busy}
											disabled={busy || !pinAction}
										>
											Submit action
										</Button>
									</Stack>
								</Card>
							)}
						</Stack>
					) : (
						<Text $muted>Select a support request.</Text>
					)}
				</Card>
			</Row>
		</Stack>
	);
}
