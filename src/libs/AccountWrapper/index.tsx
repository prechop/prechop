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
import type { Campus } from "@/types";

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

	const [savingCampus, setSavingCampus] = useState(false);

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

	async function applyToBecomeVendor() {
		const userCampusId = user?.campusId;
		if (!vendorBusinessName.trim()) {
			toast("Enter your business name", "error");
			return;
		}
		if (locationType === "ON_CAMPUS" && !hostelOrStallName.trim()) {
			toast("Enter your hostel or stall name", "error");
			return;
		}
		if (locationType === "ON_CAMPUS" && !userCampusId) {
			toast("Choose your campus before applying.", "error");
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
								campusId: userCampusId,
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
			router.push("/vendor/onboarding");
		} catch (e) {
			toast(errMsg(e), "error");
		} finally {
			setApplyingVendor(false);
		}
	}

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

				{!isVendor && (
					<Section>
						<SectionHeader title="Become a Vendor" icon="+" />
						<Stack $gap={12}>
							<Text $muted $size={14}>
								Apply with this buyer account so your orders and
								login stay together. Selling access starts only
								after admin approval.
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
