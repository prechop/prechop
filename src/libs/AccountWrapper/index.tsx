"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import styled from "styled-components";
import useSWR from "swr";
import {
	Avatar,
	Badge,
	Button,
	Card,
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
import { useAuth } from "@/hooks/Auth/useAuth";
import { useToast } from "@/hooks/useToast";
import type { Campus, VendorProfile } from "@/types";

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
    background: var(--pc-gradient-calm-orange);
  }
`;
const ProfileSummary = styled.div`
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	align-items: center;
	gap: 12px;
	min-width: 0;

	@media (max-width: 520px) {
		grid-template-columns: 1fr;
		align-items: flex-start;
	}
`;
const ProfileIdentity = styled.div`
	display: flex;
	align-items: center;
	gap: 12px;
	min-width: 0;
`;
const ProfileText = styled(Stack)`
	min-width: 0;
`;
const ProfileName = styled(Text)`
	overflow-wrap: anywhere;
	line-height: 1.2;
`;
const ProfileEmail = styled(Text)`
	overflow-wrap: anywhere;
`;
const GroupBadge = styled(Badge)`
	justify-self: end;
	max-width: 100%;
	white-space: normal;
	text-align: center;
	overflow-wrap: anywhere;

	@media (max-width: 520px) {
		justify-self: start;
		margin-left: 64px;
	}
`;
const Notice = styled.div`
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 14px 16px;
	border: 1px solid var(--pc-color-gold);
	border-radius: var(--pc-radius-sm);
	background: var(--pc-color-gold-50);
`;
export default function AccountWrapper() {
	const router = useRouter();
	const { user, isLoading, refresh, logout } = useAuth();
	const { toast } = useToast();

	const { data: campuses } = useSWR<Campus[]>("/campuses", fetcher);
	const { data: vendorApplication } = useSWR<VendorProfile>(
		"/vendors/me",
		fetcher,
		{ shouldRetryOnError: false },
	);

	const [savingCampus, setSavingCampus] = useState(false);

	const [firstName, setFirstName] = useState("");
	const [lastName, setLastName] = useState("");
	const [savingName, setSavingName] = useState(false);
	const [vendorBusinessName, setVendorBusinessName] = useState("");
	const [vendorType, setVendorType] = useState("STUDENT_COOK");
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

	async function applyToBecomeVendor() {
		if (!user) return;
		const currentUser = user;
		if (!vendorBusinessName.trim()) {
			toast("Enter your business name", "error");
			return;
		}
		setApplyingVendor(true);
		try {
			await api.post("/users/me/become-vendor", {
				businessName: vendorBusinessName.trim(),
				vendorType,
				...(currentUser.phone
					? { contactPhone: currentUser.phone }
					: {}),
			});
			toast("Vendor application started.", "success");
			await refresh();
			router.push("/vendor/onboarding");
		} catch (e) {
			toast(errMsg(e), "error");
		} finally {
			setApplyingVendor(false);
		}
	}

	const isVendor = user.groups?.includes("Vendors");
	const hasVendorApplication = !!vendorApplication;
	const isDraftVendorApplication = vendorApplication?.status === "INCOMPLETE";
	const isPendingVendorApplication =
		vendorApplication?.status === "PENDING_REVIEW";
	const showVendorApplicationSection =
		!isVendor ||
		(hasVendorApplication && vendorApplication.status !== "ACTIVE");

	return (
		<FadeIn>
			<Stack $gap={16}>
				<PageHeader
					eyebrow="Account"
					title="Your account"
					subtitle="Manage your profile and campus."
				/>

				<ProfileCard>
					<ProfileSummary>
						<ProfileIdentity>
							<Avatar
								name={`${user.firstName} ${user.lastName}`}
								size={52}
							/>
							<ProfileText $gap={2}>
								<ProfileName $weight={700} $size={17}>
									{user.firstName} {user.lastName}
								</ProfileName>
								<ProfileEmail $muted $size={14}>
									{user.email || user.phone}
								</ProfileEmail>
							</ProfileText>
						</ProfileIdentity>
						<GroupBadge $tone="gold">
							{user.groups?.[0] ?? "Member"}
						</GroupBadge>
					</ProfileSummary>
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

				{showVendorApplicationSection && (
					<Section>
						<SectionHeader
							title={
								hasVendorApplication
									? "Vendor application"
									: "Apply to be a vendor"
							}
							icon="+"
						/>
						{isDraftVendorApplication ? (
							<Notice>
								<Text $weight={700}>
									Application saved but not submitted
								</Text>
								<Text $muted $size={14}>
									You started a vendor application but have
									not submitted it for review.
								</Text>
								<Button
									$variant="secondary"
									onClick={() =>
										router.push("/vendor/onboarding")
									}
									style={{ alignSelf: "flex-start" }}
								>
									Continue application
								</Button>
							</Notice>
						) : isPendingVendorApplication ? (
							<Notice>
								<Text $weight={700}>
									Vendor application under review
								</Text>
								<Text $muted $size={14}>
									Your application has been submitted
									successfully and is currently being reviewed
									by the Prechop team. We&apos;ll notify you
									once a decision has been made.
								</Text>
								<Badge $tone="gold">
									Status: Pending review
								</Badge>
								<Row $gap={8} style={{ flexWrap: "wrap" }}>
									<Button
										$variant="secondary"
										onClick={() =>
											router.push(
												"/vendor/onboarding?mode=view",
											)
										}
									>
										View application
									</Button>
									<Button
										onClick={() =>
											router.push("/vendor/onboarding")
										}
									>
										Update application
									</Button>
								</Row>
							</Notice>
						) : hasVendorApplication ? (
							<Notice>
								<Text $weight={700}>Vendor application</Text>
								<Text $muted $size={14}>
									Your vendor application is saved on this
									account. Open it to review your details or
									make any permitted updates.
								</Text>
								<Badge $tone="gold">
									Status:{" "}
									{statusLabel(vendorApplication.status)}
								</Badge>
								<Button
									$variant="secondary"
									onClick={() =>
										router.push("/vendor/onboarding")
									}
									style={{ alignSelf: "flex-start" }}
								>
									Open application
								</Button>
							</Notice>
						) : (
							<Stack $gap={12}>
								<Text $muted $size={14}>
									Apply with this buyer account so your orders
									and login stay together. You&apos;ll finish
									location, verification documents and payout
									setup on the next screen.
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
									onChange={(e) =>
										setVendorType(e.target.value)
									}
								>
									<option value="STUDENT_COOK">
										Student cook
									</option>
									<option value="CAMPUS_STALL">
										Campus stall
									</option>
									<option value="RESTAURANT">
										Restaurant
									</option>
									<option value="BAKERY">Bakery</option>
								</Select>
								<Button
									$variant="secondary"
									onClick={applyToBecomeVendor}
									$loading={applyingVendor}
									disabled={applyingVendor}
									style={{ alignSelf: "flex-start" }}
								>
									Start vendor setup
								</Button>
							</Stack>
						)}
					</Section>
				)}

				<Section>
					<SectionHeader title="Help / FAQs" icon="?" />
					<Stack $gap={12}>
						<Text $muted $size={14}>
							Find answers about ordering, Pay for Me, fees,
							refunds, pickup, delivery and support.
						</Text>
						<Button
							as={Link}
							href="/help?audience=buyer"
							$variant="secondary"
							style={{ alignSelf: "flex-start" }}
						>
							Open Help / FAQs
						</Button>
					</Stack>
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

function statusLabel(status: VendorProfile["status"]): string {
	switch (status) {
		case "PENDING_REVIEW":
			return "Pending review";
		case "CHANGES_REQUESTED":
			return "Changes requested";
		case "ACTIVE":
			return "Approved";
		case "SUSPENDED":
			return "Suspended";
		default:
			return "Not submitted";
	}
}
