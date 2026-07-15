"use client";

import { useRouter } from "next/navigation";
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
const CampusGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
`;
const CampusChip = styled.button<{ $on: boolean }>`
  all: unset;
  box-sizing: border-box;
  padding: 11px 12px;
  border-radius: var(--pc-radius-sm);
  border: 1.5px solid
    ${(p) => (p.$on ? "var(--pc-color-primary)" : "var(--pc-border)")};
  background: ${(p) =>
		p.$on ? "var(--pc-color-primary-50)" : "var(--pc-surface)"};
  color: ${(p) => (p.$on ? "var(--pc-color-primary)" : "var(--pc-text)")};
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
  text-align: center;
`;

export default function AccountWrapper() {
	const router = useRouter();
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
	const [vendorBusinessName, setVendorBusinessName] = useState("");
	const [vendorType, setVendorType] = useState("STUDENT_COOK");
	const [locationType, setLocationType] = useState("ON_CAMPUS");
	const [hostelOrStallName, setHostelOrStallName] = useState("");
	const [state, setState] = useState("");
	const [areaOrAddress, setAreaOrAddress] = useState("");
	const [campusIds, setCampusIds] = useState<string[]>([]);
	const [applyingVendor, setApplyingVendor] = useState(false);

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

	async function applyToBecomeVendor() {
		if (!vendorBusinessName.trim()) {
			toast("Enter your business name", "error");
			return;
		}
		if (locationType === "ON_CAMPUS" && !hostelOrStallName.trim()) {
			toast("Enter your hostel or stall name", "error");
			return;
		}
		if (
			locationType === "OFF_CAMPUS" &&
			(!state.trim() || !areaOrAddress.trim() || campusIds.length === 0)
		) {
			toast(
				"Enter your state, address and select at least one campus",
				"error",
			);
			return;
		}
		setApplyingVendor(true);
		try {
			await api.post("/users/me/become-vendor", {
				businessName: vendorBusinessName.trim(),
				vendorType,
				location:
					locationType === "ON_CAMPUS"
						? {
								locationType,
								hostelOrStallName: hostelOrStallName.trim(),
							}
						: {
								locationType,
								state: state.trim(),
								areaOrAddress: areaOrAddress.trim(),
								campusIds,
							},
			});
			toast("Vendor application started.", "success");
			await refresh();
			router.push("/vendor/settings");
		} catch (e) {
			toast(errMsg(e), "error");
		} finally {
			setApplyingVendor(false);
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
	const isVendor = user.groups?.includes("Vendors");
	const stateCampuses = (campuses ?? []).filter(
		(c) =>
			state.trim() &&
			c.state.trim().toLowerCase() === state.trim().toLowerCase(),
	);

	function toggleCampus(id: string) {
		setCampusIds((current) => {
			if (current.includes(id)) return current.filter((x) => x !== id);
			if (current.length >= 3) {
				toast("Select up to 3 campuses", "error");
				return current;
			}
			return [...current, id];
		});
	}

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

				{!isVendor && (
					<Section>
						<SectionHeader title="Become a Vendor" icon="+" />
						<Stack $gap={12}>
							<Text $muted $size={14}>
								Apply with this buyer account so your phone
								number, orders and login stay together.
							</Text>
							<Input
								label="Business name"
								value={vendorBusinessName}
								onChange={(e) =>
									setVendorBusinessName(e.target.value)
								}
								placeholder="Ada's Kitchen"
							/>
							<Select
								label="Vendor type"
								value={vendorType}
								onChange={(e) => setVendorType(e.target.value)}
							>
								<option value="STUDENT_COOK">
									Student cook
								</option>
								<option value="CAMPUS_STALL">
									Campus stall
								</option>
								<option value="RESTAURANT">Restaurant</option>
								<option value="BAKERY">Bakery</option>
							</Select>
							<Select
								label="Location"
								value={locationType}
								onChange={(e) =>
									setLocationType(e.target.value)
								}
							>
								<option value="ON_CAMPUS">On campus</option>
								<option value="OFF_CAMPUS">Off campus</option>
							</Select>
							{locationType === "ON_CAMPUS" ? (
								<Input
									label="Hostel or stall name"
									value={hostelOrStallName}
									onChange={(e) =>
										setHostelOrStallName(e.target.value)
									}
									placeholder="Moremi Hall, Block A"
								/>
							) : (
								<>
									<Input
										label="State"
										value={state}
										onChange={(e) => {
											setState(e.target.value);
											setCampusIds([]);
										}}
										placeholder="Lagos"
									/>
									<Input
										label="Area or address"
										value={areaOrAddress}
										onChange={(e) =>
											setAreaOrAddress(e.target.value)
										}
										placeholder="Yaba, near campus gate"
									/>
									{state.trim() && (
										<Stack $gap={8}>
											<Text $weight={700} $size={13}>
												Campuses to show your menu on
											</Text>
											{stateCampuses.length > 0 ? (
												<CampusGrid>
													{stateCampuses.map((c) => (
														<CampusChip
															key={c.id}
															type="button"
															$on={campusIds.includes(
																c.id,
															)}
															onClick={() =>
																toggleCampus(
																	c.id,
																)
															}
														>
															{c.name}
														</CampusChip>
													))}
												</CampusGrid>
											) : (
												<Text $muted $size={13}>
													No active campuses found for
													this state.
												</Text>
											)}
											<Text $muted $size={12}>
												{campusIds.length}/3 selected
											</Text>
										</Stack>
									)}
								</>
							)}
							<Button
								$variant="secondary"
								onClick={applyToBecomeVendor}
								$loading={applyingVendor}
								disabled={applyingVendor}
								style={{ alignSelf: "flex-start" }}
							>
								Apply to become a vendor
							</Button>
						</Stack>
					</Section>
				)}

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
