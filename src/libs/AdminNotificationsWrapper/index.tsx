"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import {
	Badge,
	Button,
	Card,
	EmptyState,
	Input,
	PageHeader,
	Row,
	Select,
	Stack,
	Text,
	Textarea,
} from "@/components";
import { api, apiData } from "@/constants/api";
import { fetcher } from "@/constants/fetcher";
import { useToast } from "@/hooks/useToast";

interface Campus {
	id: string;
	name: string;
}

interface AdminInboxNotification {
	id: string;
	title: string;
	body: string;
	type: string;
	isRead: boolean;
	createdAt: string;
	data?: {
		kind?: string;
		category?: string;
		severity?: "info" | "warning" | "critical";
		submittedBy?: string;
		recordId?: string;
		adminPath?: string;
		actionLabel?: string;
		occurredAt?: string;
		reason?: {
			code?: string;
			explanation?: string;
		};
		references?: {
			orderId?: string;
			orderNumber?: string;
			vendorId?: string;
			buyerId?: string;
			supportRequestId?: string;
			refundId?: string;
			paymentId?: string;
		};
	};
}

type Tab = "inbox" | "broadcasts";

export default function AdminNotificationsWrapper() {
	const { toast } = useToast();
	const { data: campuses } = useSWR<Campus[]>("/campuses", fetcher);
	const { data: inbox, mutate: mutateInbox } = useSWR<
		AdminInboxNotification[]
	>("/admin/notifications?limit=50", fetcher, {
		refreshInterval: 30_000,
	});
	const [tab, setTab] = useState<Tab>("inbox");
	const [title, setTitle] = useState("");
	const [body, setBody] = useState("");
	const [campusId, setCampusId] = useState("");
	const [busy, setBusy] = useState(false);
	const [readingId, setReadingId] = useState<string | null>(null);

	async function markRead(id: string) {
		setReadingId(id);
		try {
			await api.patch(`/notifications/${id}/read`, {});
			await mutateInbox();
		} catch {
			toast("Could not mark notification read.", "error");
		} finally {
			setReadingId(null);
		}
	}

	async function send() {
		if (!title.trim() || !body.trim()) {
			toast("Title and message are required.", "error");
			return;
		}
		setBusy(true);
		try {
			const res = await apiData<{ recipients: number }>(
				api.post("/admin/notifications", {
					title,
					body,
					...(campusId ? { campusId } : {}),
				}),
			);
			toast(`Sent to ${res.recipients} users.`, "success");
			setTitle("");
			setBody("");
		} catch {
			toast("Failed to send broadcast.", "error");
		} finally {
			setBusy(false);
		}
	}

	return (
		<Stack $gap={20}>
			<PageHeader
				eyebrow="Engagement"
				title="Admin notifications"
				subtitle="Review operational alerts and send broadcasts."
			/>
			<Row $gap={8} $wrap>
				<Button
					$variant={tab === "inbox" ? "primary" : "secondary"}
					onClick={() => setTab("inbox")}
				>
					Inbox
					{(inbox ?? []).some((item) => !item.isRead) && (
						<Badge $tone="danger">
							{
								(inbox ?? []).filter((item) => !item.isRead)
									.length
							}
						</Badge>
					)}
				</Button>
				<Button
					$variant={tab === "broadcasts" ? "primary" : "secondary"}
					onClick={() => setTab("broadcasts")}
				>
					Broadcasts
				</Button>
			</Row>

			{tab === "inbox" ? (
				<Stack $gap={12}>
					{(inbox ?? []).length === 0 ? (
						<EmptyState
							icon="🔔"
							title="No admin notifications"
							description="Actionable operational events will appear here."
						/>
					) : (
						(inbox ?? []).map((item) => (
							<Card key={item.id}>
								<Stack $gap={10}>
									<Row
										$justify="space-between"
										$align="flex-start"
										$gap={12}
										$wrap
									>
										<Stack $gap={4}>
											<Row $gap={8} $align="center" $wrap>
												<Text $weight={800}>
													{item.title}
												</Text>
												<Badge
													$tone={severityTone(
														item.data?.severity,
													)}
												>
													{item.data?.category ??
														item.data?.kind ??
														"Admin"}
												</Badge>
												{!item.isRead && (
													<Badge $tone="primary">
														Unread
													</Badge>
												)}
											</Row>
											<Text $muted $size={13}>
												{formatWhen(
													item.data?.occurredAt ??
														item.createdAt,
												)}
											</Text>
										</Stack>
										<Row $gap={8} $wrap>
											{item.data?.adminPath && (
												<Button
													as={Link}
													href={item.data.adminPath}
													$size="sm"
												>
													{item.data.actionLabel ??
														"View"}
												</Button>
											)}
											{!item.isRead && (
												<Button
													$size="sm"
													$variant="secondary"
													$loading={
														readingId === item.id
													}
													onClick={() =>
														markRead(item.id)
													}
												>
													Mark read
												</Button>
											)}
										</Row>
									</Row>
									<Text $size={14}>{item.body}</Text>
									{item.data?.reason?.explanation && (
										<Text $muted $size={13}>
											Reason:{" "}
											{item.data.reason.code
												? `${item.data.reason.code} - `
												: ""}
											{item.data.reason.explanation}
										</Text>
									)}
									<Text $muted $size={12}>
										{referenceText(item)}
									</Text>
								</Stack>
							</Card>
						))
					)}
				</Stack>
			) : (
				<Card>
					<Stack $gap={14}>
						<div>
							<Text $muted $size={13}>
								Title
							</Text>
							<Input
								value={title}
								onChange={(e) => setTitle(e.target.value)}
								placeholder="e.g. Free delivery this weekend!"
								maxLength={120}
							/>
						</div>
						<div>
							<Text $muted $size={13}>
								Message
							</Text>
							<Textarea
								value={body}
								onChange={(e) => setBody(e.target.value)}
								placeholder="What do you want to tell everyone?"
								rows={4}
								maxLength={500}
							/>
						</div>
						<div>
							<Text $muted $size={13}>
								Audience
							</Text>
							<Select
								value={campusId}
								onChange={(e) => setCampusId(e.target.value)}
							>
								<option value="">All campuses</option>
								{(campuses ?? []).map((c) => (
									<option key={c.id} value={c.id}>
										{c.name}
									</option>
								))}
							</Select>
						</div>
						<Button onClick={send} $loading={busy} disabled={busy}>
							Send broadcast
						</Button>
					</Stack>
				</Card>
			)}
		</Stack>
	);
}

function severityTone(
	severity?: NonNullable<AdminInboxNotification["data"]>["severity"],
): "primary" | "success" | "warning" | "danger" | "muted" {
	if (severity === "critical") return "danger";
	if (severity === "warning") return "warning";
	if (severity === "info") return "primary";
	return "muted";
}

function formatWhen(value?: string) {
	if (!value) return "";
	const date = new Date(value);
	if (!Number.isFinite(date.getTime())) return value;
	return date.toLocaleString();
}

function referenceText(item: AdminInboxNotification) {
	const refs = item.data?.references;
	return [
		refs?.orderNumber ? `Order ${refs.orderNumber}` : null,
		refs?.vendorId ? `Vendor ${refs.vendorId}` : null,
		refs?.buyerId ? `Buyer ${refs.buyerId}` : null,
		refs?.supportRequestId ? `Support ${refs.supportRequestId}` : null,
		refs?.refundId ? `Refund ${refs.refundId}` : null,
		refs?.paymentId ? `Payment ${refs.paymentId}` : null,
		item.data?.recordId ? `Ref ${item.data.recordId}` : null,
	]
		.filter(Boolean)
		.join(" | ");
}
