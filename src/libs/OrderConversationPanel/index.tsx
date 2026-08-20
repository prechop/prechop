"use client";

import { useEffect, useState } from "react";
import { FiMessageCircle, FiRefreshCw, FiSend } from "react-icons/fi";
import styled from "styled-components";
import useSWR from "swr";
import { Badge, Button, Card, Row, Stack, Text, Textarea } from "@/components";
import { api } from "@/constants/api";
import { fetcher } from "@/constants/fetcher";
import { formatDateTime } from "@/constants/formatters";
import { useToast } from "@/hooks/useToast";
import type { OrderConversation } from "@/types";

const Thread = styled(Card)`
	padding: var(--pc-space-4);
`;

const Messages = styled.div`
	display: grid;
	gap: 10px;
	max-height: 320px;
	overflow: auto;
	padding: 2px;
`;

const Bubble = styled.div<{ $own: boolean }>`
	justify-self: ${(p) => (p.$own ? "end" : "start")};
	max-width: min(86%, 460px);
	display: grid;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid
		${(p) => (p.$own ? "var(--pc-color-primary)" : "var(--pc-border)")};
	border-radius: var(--pc-radius-sm);
	background: ${(p) =>
		p.$own ? "var(--pc-color-primary-50)" : "var(--pc-surface-2)"};
	overflow-wrap: anywhere;
`;

const Empty = styled.div`
	display: grid;
	place-items: center;
	min-height: 96px;
	text-align: center;
	border: 1px dashed var(--pc-border);
	border-radius: var(--pc-radius-sm);
	background: var(--pc-surface-2);
	padding: var(--pc-space-4);
`;

const Composer = styled.form`
	display: grid;
	gap: 8px;
`;

function senderLabel(senderRole: string) {
	if (senderRole === "BUYER") return "Buyer";
	if (senderRole === "VENDOR") return "Kitchen";
	return "Admin";
}

function errMsg(error: unknown) {
	const maybe = error as { response?: { data?: { message?: string } } };
	return maybe.response?.data?.message ?? "Message could not be sent.";
}

export function OrderConversationPanel({
	orderId,
	admin = false,
	title = "Order messages",
	readOnly = false,
	autoFocus = false,
}: {
	orderId: string;
	admin?: boolean;
	title?: string;
	readOnly?: boolean;
	autoFocus?: boolean;
}) {
	const { toast } = useToast();
	const endpoint = admin
		? `/admin/orders/${orderId}/conversation`
		: `/orders/${orderId}/conversation`;
	const { data, error, isLoading, mutate } = useSWR<OrderConversation>(
		endpoint,
		fetcher,
		{ refreshInterval: admin ? 0 : 10_000 },
	);
	const [message, setMessage] = useState("");
	const [sending, setSending] = useState(false);

	const conversation = data ?? null;
	const remaining = 1000 - message.length;
	const lastMessageCount = conversation?.messages.length ?? 0;

	useEffect(() => {
		if (admin || !conversation || conversation.unreadCount <= 0) return;
		void api.patch(`/orders/${orderId}/conversation`);
	}, [admin, conversation, orderId]);

	const ownRole =
		conversation?.participantRole === "buyer"
			? "BUYER"
			: conversation?.participantRole === "vendor"
				? "VENDOR"
				: "ADMIN";

	async function submit(event: React.FormEvent) {
		event.preventDefault();
		const trimmed = message.trim();
		if (!trimmed || !conversation?.canSend || readOnly) return;
		setSending(true);
		const clientMessageId = `${Date.now()}-${Math.random()
			.toString(36)
			.slice(2)}`;
		try {
			await api.post(endpoint, { message: trimmed, clientMessageId });
			setMessage("");
			await mutate();
		} catch (error) {
			toast(errMsg(error), "error");
		} finally {
			setSending(false);
		}
	}

	return (
		<Thread id="messages">
			<Stack $gap={12}>
				<Row $justify="space-between" $align="center" $gap={10} $wrap>
					<Row $gap={8} $align="center">
						<FiMessageCircle size={17} aria-hidden />
						<Text $weight={900}>{title}</Text>
						{conversation && conversation.unreadCount > 0 && (
							<Badge $tone="primary">
								{conversation.unreadCount} unread
							</Badge>
						)}
					</Row>
					<Button
						type="button"
						$size="sm"
						$variant="ghost"
						onClick={() => mutate()}
						aria-label="Refresh messages"
					>
						<FiRefreshCw size={14} aria-hidden />
					</Button>
				</Row>

				{isLoading ? (
					<Empty>
						<Text $muted>Loading messages...</Text>
					</Empty>
				) : error ? (
					<Empty>
						<Stack $gap={8} style={{ alignItems: "center" }}>
							<Text $weight={800}>Messages unavailable</Text>
							<Text $muted $size={13}>
								Open support if this order needs help.
							</Text>
						</Stack>
					</Empty>
				) : conversation && lastMessageCount > 0 ? (
					<Messages>
						{conversation.messages.map((item) => {
							const own =
								item.senderRole === ownRole &&
								conversation.participantRole !== "admin";
							return (
								<Bubble key={item.id} $own={own}>
									<Row
										$gap={8}
										$justify="space-between"
										$align="center"
									>
										<Text $size={12} $weight={900}>
											{senderLabel(item.senderRole)}
										</Text>
										<Text $size={11} $muted>
											{formatDateTime(item.createdAt)}
										</Text>
									</Row>
									<Text $size={14}>{item.body}</Text>
								</Bubble>
							);
						})}
					</Messages>
				) : (
					<Empty>
						<Text $muted $size={13}>
							No messages yet.
						</Text>
					</Empty>
				)}

				{readOnly || admin ? (
					<Text $muted $size={13}>
						Admins can review order messages for dispute support.
					</Text>
				) : conversation?.canSend ? (
					<Composer onSubmit={submit}>
						<Textarea
							label="Message"
							value={message}
							autoFocus={autoFocus}
							maxLength={1000}
							onChange={(event) =>
								setMessage(event.target.value.slice(0, 1000))
							}
							placeholder="Write a short order update..."
						/>
						<Row $justify="space-between" $align="center" $gap={10}>
							<Text
								$muted
								$size={12}
								style={{
									color:
										remaining < 0
											? "var(--pc-color-danger)"
											: undefined,
								}}
							>
								{remaining} characters left
							</Text>
							<Button
								type="submit"
								$size="sm"
								$loading={sending}
								disabled={!message.trim()}
							>
								<FiSend size={14} aria-hidden /> Send
							</Button>
						</Row>
					</Composer>
				) : (
					<Text $muted $size={13}>
						{conversation?.closedReason ??
							"Messaging opens after payment."}
					</Text>
				)}
			</Stack>
		</Thread>
	);
}
