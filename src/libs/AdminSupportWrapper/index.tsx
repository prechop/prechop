"use client";

import { useState } from "react";
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
import { formatDateTime } from "@/constants/formatters";
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
	const { toast } = useToast();
	const [status, setStatus] = useState<"" | SupportStatus>("");
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [reply, setReply] = useState("");
	const [busy, setBusy] = useState(false);
	const key = status
		? `/admin/support-requests?status=${status}`
		: "/admin/support-requests";
	const { data, isLoading, mutate } = useSWR<SupportRequest[]>(key, fetcher, {
		refreshInterval: 10_000,
	});
	const requests = data ?? [];
	const selected = requests.find((r) => r.id === selectedId) ?? requests[0];

	async function sendReply() {
		if (!selected || !reply.trim()) return;
		setBusy(true);
		try {
			await api.post(`/admin/support-requests/${selected.id}/messages`, {
				message: reply.trim(),
			});
			setReply("");
			toast("Reply sent", "success");
			await mutate();
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
			});
			toast("Support request updated", "success");
			await mutate();
		} catch {
			toast("Could not update request", "error");
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
			await mutate();
		} catch {
			toast("Could not assign request", "error");
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
							<Row $gap={10} $wrap>
								<Button
									onClick={sendReply}
									$loading={busy}
									disabled={busy || !reply.trim()}
								>
									Send reply
								</Button>
								<Button
									$variant="secondary"
									onClick={() => updateStatus("RESOLVED")}
									disabled={busy}
								>
									Mark resolved
								</Button>
								<Button
									$variant="ghost"
									onClick={() => updateStatus("CLOSED")}
									disabled={busy}
								>
									Close
								</Button>
								<Button
									$variant="ghost"
									onClick={assignToMe}
									disabled={busy}
								>
									Assign to me
								</Button>
							</Row>
						</Stack>
					) : (
						<Text $muted>Select a support request.</Text>
					)}
				</Card>
			</Row>
		</Stack>
	);
}
