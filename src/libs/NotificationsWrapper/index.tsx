"use client";

import styled from "styled-components";
import useSWR from "swr";
import {
	Badge,
	Button,
	Card,
	EmptyState,
	FadeIn,
	PageHeader,
	Row,
	Stack,
	Text,
} from "@/components";
import { api } from "@/constants/api";
import { fetcher } from "@/constants/fetcher";
import { formatDateTime } from "@/constants/formatters";
import { useToast } from "@/hooks/useToast";
import { enablePushNotifications } from "@/libs/AccountWrapper/push";
import type { AppNotification } from "@/types";

const Section = styled(Card)`
	padding: var(--pc-space-5);
`;
const NotifList = styled.div`
	display: flex;
	flex-direction: column;
`;
const NotifItem = styled.div<{ $unread: boolean }>`
	display: flex;
	gap: 12px;
	padding: 14px 0;
	border-bottom: 1px solid var(--pc-border);
	&:last-child {
		border-bottom: none;
	}
`;
const Dot = styled.span<{ $unread: boolean }>`
	flex: 0 0 auto;
	width: 9px;
	height: 9px;
	margin-top: 6px;
	border-radius: 50%;
	background: ${(p) =>
		p.$unread ? "var(--pc-color-primary)" : "var(--pc-border)"};
`;

export default function NotificationsWrapper() {
	const { toast } = useToast();
	const { data, mutate } = useSWR<{
		items: AppNotification[];
		unread: number;
	}>("/notifications?limit=50", fetcher);
	const notifications = data?.items ?? [];
	const unreadCount =
		data?.unread ?? notifications.filter((n) => !n.isRead).length;

	async function enablePush() {
		try {
			await enablePushNotifications();
			toast("Notifications enabled.", "success");
		} catch (e) {
			toast(
				e instanceof Error
					? e.message
					: "Could not enable notifications.",
				"error",
			);
		}
	}

	async function markAllRead() {
		try {
			await api.post("/notifications/read-all");
			await mutate();
		} catch {
			toast("Could not mark notifications as read.", "error");
		}
	}

	return (
		<FadeIn>
			<Stack $gap={16}>
				<PageHeader
					eyebrow="Alerts"
					title="Notifications"
					subtitle="Order updates, payment alerts and campus news."
					actions={
						<Button
							$variant="secondary"
							$size="sm"
							onClick={enablePush}
						>
							Enable push
						</Button>
					}
				/>

				<Section>
					<Stack $gap={12}>
						<Row $justify="space-between" $align="center" $gap={12}>
							<Row $gap={8} $align="center">
								<Text $weight={800}>Inbox</Text>
								{unreadCount > 0 && (
									<Badge $tone="primary">{unreadCount}</Badge>
								)}
							</Row>
							{unreadCount > 0 && (
								<Button
									$variant="ghost"
									$size="sm"
									onClick={markAllRead}
								>
									Mark all read
								</Button>
							)}
						</Row>

						{notifications.length === 0 ? (
							<EmptyState
								icon="ðŸ””"
								title="No notifications yet"
								description="Order updates and campus news will show up here."
							/>
						) : (
							<NotifList>
								{notifications.map((n) => (
									<NotifItem key={n.id} $unread={!n.isRead}>
										<Dot $unread={!n.isRead} aria-hidden />
										<Stack $gap={2}>
											<Text
												$weight={n.isRead ? 400 : 700}
												$size={14}
											>
												{n.title}
											</Text>
											<Text $muted $size={13}>
												{n.body}
											</Text>
											<Text $muted $size={12}>
												{formatDateTime(n.createdAt)}
											</Text>
										</Stack>
									</NotifItem>
								))}
							</NotifList>
						)}
					</Stack>
				</Section>
			</Stack>
		</FadeIn>
	);
}
