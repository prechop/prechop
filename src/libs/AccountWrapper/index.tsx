"use client";

import { useEffect, useState } from "react";
import styled from "styled-components";
import useSWR from "swr";
import {
	Avatar,
	Badge,
	Button,
	Card,
	EmptyState,
	FadeIn,
	Input,
	PageHeader,
	Row,
	SectionHeader,
	Select,
	Stack,
	Text,
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
const ProfileCard = styled(Card)`
	padding: var(--pc-space-5);
	position: relative;
	overflow: hidden;
	&::after {
		content: "";
		position: absolute;
		inset: 0 0 auto 0;
		height: 4px;
		background: var(--pc-gradient-hero);
	}
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

	const [firstName, setFirstName] = useState("");
	const [lastName, setLastName] = useState("");
	const [savingName, setSavingName] = useState(false);

	// Keep the editable fields in sync with the loaded/refreshed profile.
	useEffect(() => {
		if (user) {
			setFirstName(user.firstName ?? "");
			setLastName(user.lastName ?? "");
		}
	}, [user]);

	if (isLoading || !user) return <PageLoader />;

	const nameChanged =
		firstName.trim() !== user.firstName ||
		lastName.trim() !== (user.lastName ?? "");

	async function saveName() {
		if (!firstName.trim()) {
			toast("Enter your first name", "error");
			return;
		}
		setSavingName(true);
		try {
			await api.patch("/users/me", {
				firstName: firstName.trim(),
				// lastName must be non-empty when sent; omit to leave unchanged.
				...(lastName.trim() ? { lastName: lastName.trim() } : {}),
			});
			toast("Profile updated.", "success");
			refresh();
		} catch (e) {
			toast(errMsg(e), "error");
		} finally {
			setSavingName(false);
		}
	}

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
		<FadeIn>
			<Stack $gap={16}>
				<PageHeader
					eyebrow="Account"
					title="Your account"
					subtitle="Manage your profile, campus and notifications."
				/>

				<ProfileCard>
					<Row $justify="space-between" $align="center" $gap={12}>
						<Row $gap={12} $align="center">
							<Avatar
								name={`${user.firstName} ${user.lastName}`}
								size={52}
							/>
							<Stack $gap={2}>
								<Text $weight={700} $size={17}>
									{user.firstName} {user.lastName}
								</Text>
								<Text $muted $size={14}>
									{user.phone}
								</Text>
							</Stack>
						</Row>
						<Badge $tone="gold">
							{user.groups?.[0] ?? "Member"}
						</Badge>
					</Row>
				</ProfileCard>

				<Section>
					<SectionHeader title="Your details" icon="🪪" />
					<Stack $gap={12}>
						<Input
							label="First name"
							value={firstName}
							onChange={(e) => setFirstName(e.target.value)}
							placeholder="Ada"
						/>
						<Input
							label="Last name"
							value={lastName}
							onChange={(e) => setLastName(e.target.value)}
							placeholder="Obi"
						/>
						<Button
							$variant="secondary"
							onClick={saveName}
							$loading={savingName}
							disabled={savingName || !nameChanged}
							style={{ alignSelf: "flex-start" }}
						>
							Save details
						</Button>
					</Stack>
				</Section>

				<Section>
					<SectionHeader title="Campus" icon="📍" />
					<Stack $gap={12}>
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
							You&apos;ll see kitchens open on your selected
							campus.
						</Text>
					</Stack>
				</Section>

				<Section>
					<SectionHeader
						title={
							<Row $gap={8} $align="center">
								<span>Notifications</span>
								{unreadCount > 0 && (
									<Badge $tone="primary">{unreadCount}</Badge>
								)}
							</Row>
						}
						icon="🔔"
						action={
							<Button
								$variant="ghost"
								$size="sm"
								onClick={enablePush}
								$loading={enabling}
							>
								Enable push
							</Button>
						}
					/>

					{notifications.length === 0 ? (
						<EmptyState
							icon="🔔"
							title="No notifications yet"
							description="Order updates and campus news will show up here."
						/>
					) : (
						<Stack $gap={12}>
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
						</Stack>
					)}
				</Section>

				<Button $variant="secondary" $full onClick={() => logout()}>
					Log out
				</Button>
			</Stack>
		</FadeIn>
	);
}

function errMsg(e: unknown): string {
	const err = e as { response?: { data?: { message?: string } } };
	return err?.response?.data?.message ?? "Something went wrong. Try again.";
}
