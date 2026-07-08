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
import { formatDateTime } from "@/constants/formatters";
import { useAuth } from "@/hooks/Auth/useAuth";
import { useToast } from "@/hooks/useToast";
import { enablePushNotifications } from "@/libs/AccountWrapper/push";
import type { AppNotification, Campus } from "@/types";

const Section = styled(Card)`
	padding: var(--pc-space-5);
`;
const NotifItem = styled.div<{ $unread: boolean }>`
	padding: 12px 0;
	border-bottom: 1px solid var(--pc-border);
	&:last-child { border-bottom: none; }
	opacity: ${(p) => (p.$unread ? 1 : 0.7)};
`;

export default function AccountWrapper() {
	const { user, isLoading, refresh, logout } = useAuth();
	const { toast } = useToast();

	const { data: campuses } = useSWR<Campus[]>("/campuses", fetcher);
	const { data: notifData, mutate: mutateNotifs } = useSWR<{
		items: AppNotification[];
		unread: number;
	}>("/notifications?limit=20", fetcher);
	const notifications = notifData?.items ?? [];

	const [savingCampus, setSavingCampus] = useState(false);
	const [enabling, setEnabling] = useState(false);

	if (isLoading || !user) return <PageLoader />;

	async function changeCampus(campusId: string) {
		if (!campusId || campusId === user?.campusId) return;
		setSavingCampus(true);
		try {
			await api.patch("/users/me/campus", { campusId });
			toast("Campus updated.", "success");
			refresh();
		} catch (e) {
			toast(errMsg(e), "error");
		} finally {
			setSavingCampus(false);
		}
	}

	async function enablePush() {
		setEnabling(true);
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
		} finally {
			setEnabling(false);
		}
	}

	async function markAllRead() {
		try {
			await api.post("/notifications/read-all");
			mutateNotifs();
		} catch {
			// ignore
		}
	}

	const unreadCount = notifications.filter((n) => !n.isRead).length;

	return (
		<Stack $gap={16}>
			<Title $size={24}>Account</Title>

			<Section>
				<Stack $gap={10}>
					<Row $justify="space-between">
						<Text $weight={700}>
							{user.firstName} {user.lastName}
						</Text>
						<Badge $tone="muted">{user.role}</Badge>
					</Row>
					<Text $muted>{user.phone}</Text>
				</Stack>
			</Section>

			<Section>
				<Stack $gap={12}>
					<Text $weight={700}>Campus</Text>
					<Select
						value={user.campusId}
						disabled={savingCampus}
						onChange={(e) => changeCampus(e.target.value)}
					>
						{(campuses ?? []).map((c) => (
							<option key={c.id} value={c.id}>
								{c.name}
							</option>
						))}
					</Select>
					<Text $muted $size={13}>
						You&apos;ll see kitchens open on your selected campus.
					</Text>
				</Stack>
			</Section>

			<Section>
				<Stack $gap={12}>
					<Row $justify="space-between">
						<Text $weight={700}>
							Notifications
							{unreadCount > 0 && (
								<Badge
									$tone="primary"
									style={{ marginLeft: 8 }}
								>
									{unreadCount}
								</Badge>
							)}
						</Text>
						<Button
							$variant="ghost"
							$size="sm"
							onClick={enablePush}
							$loading={enabling}
						>
							Enable push
						</Button>
					</Row>

					{notifications.length === 0 ? (
						<Text $muted $size={14}>
							No notifications yet.
						</Text>
					) : (
						<>
							{unreadCount > 0 && (
								<Button
									$variant="ghost"
									$size="sm"
									onClick={markAllRead}
									style={{ alignSelf: "flex-start" }}
								>
									Mark all read
								</Button>
							)}
							<div>
								{notifications.map((n) => (
									<NotifItem key={n.id} $unread={!n.isRead}>
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
							</div>
						</>
					)}
				</Stack>
			</Section>

			<Button $variant="secondary" $full onClick={() => logout()}>
				Log out
			</Button>
		</Stack>
	);
}

function errMsg(e: unknown): string {
	const err = e as { response?: { data?: { message?: string } } };
	return err?.response?.data?.message ?? "Something went wrong. Try again.";
}
