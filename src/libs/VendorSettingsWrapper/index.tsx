"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styled from "styled-components";
import useSWR from "swr";
import {
	Avatar,
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
	Textarea,
} from "@/components";
import { PageLoader } from "@/components/Loader";
import { api, apiData } from "@/constants/api";
import { fetcher } from "@/constants/fetcher";
import { useAuth } from "@/hooks/Auth/useAuth";
import { useToast } from "@/hooks/useToast";
import BankDetailsForm from "@/libs/BankDetailsForm";
import type { VendorMe } from "@/libs/VendorOnboardingWrapper";
import type { Campus } from "@/types";

interface School {
	id: string;
	name: string;
	state: string;
}

const VENDOR_TYPES = [
	{ value: "STUDENT_COOK", label: "Student cook" },
	{ value: "CAMPUS_STALL", label: "Campus stall" },
	{ value: "RESTAURANT", label: "Restaurant" },
	{ value: "BAKERY", label: "Bakery" },
];
const CATEGORIES = [
	{ value: "MEALS", label: "Meals" },
	{ value: "SNACKS", label: "Snacks" },
	{ value: "DRINKS", label: "Drinks" },
	{ value: "BAKED_GOODS", label: "Baked goods" },
];

const CatGrid = styled.div`
	display: grid;
	grid-template-columns: repeat(2, 1fr);
	gap: 8px;
`;
const CatChip = styled.button<{ $on: boolean }>`
	all: unset;
	box-sizing: border-box;
	text-align: center;
	padding: 12px;
	border-radius: var(--pc-radius-sm);
	font-size: 14px;
	font-weight: 700;
	cursor: pointer;
	transition: border-color var(--pc-dur) var(--pc-ease),
		background var(--pc-dur) var(--pc-ease);
	border: 1.5px solid
		${(p) => (p.$on ? "var(--pc-color-primary)" : "var(--pc-border)")};
	background: ${(p) =>
		p.$on ? "var(--pc-color-primary-50)" : "var(--pc-surface)"};
	color: ${(p) => (p.$on ? "var(--pc-color-primary)" : "var(--pc-text)")};
	&:hover {
		border-color: var(--pc-color-primary);
	}
`;
const ToggleRow = styled.div`
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--pc-space-3);
	padding: var(--pc-space-3) var(--pc-space-4);
	background: var(--pc-surface-2);
	border: 1px solid var(--pc-border);
	border-radius: var(--pc-radius-sm);
`;
const Switch = styled.button<{ $on: boolean }>`
	position: relative;
	width: 46px;
	height: 27px;
	border-radius: var(--pc-radius-pill);
	border: none;
	cursor: pointer;
	flex-shrink: 0;
	transition: background var(--pc-dur) var(--pc-ease);
	background: ${(p) =>
		p.$on ? "var(--pc-color-accent)" : "var(--pc-surface-3)"};
	&::after {
		content: "";
		position: absolute;
		top: 3px;
		left: ${(p) => (p.$on ? "22px" : "3px")};
		width: 21px;
		height: 21px;
		border-radius: 999px;
		background: var(--pc-text-inverse);
		box-shadow: var(--pc-shadow);
		transition: left var(--pc-dur) var(--pc-ease);
	}
`;
const AccountLink = styled(Link)`
	display: inline-flex;
	align-items: center;
	gap: 6px;
	color: var(--pc-color-primary);
	font-weight: 700;
	font-size: 14px;
`;

function errMsg(e: unknown): string {
	const m = (e as { response?: { data?: { message?: string } } })?.response
		?.data?.message;
	return m ?? "Something went wrong. Please try again.";
}

function ToggleSetting({
	title,
	hint,
	on,
	onToggle,
}: {
	title: string;
	hint: string;
	on: boolean;
	onToggle: () => void;
}) {
	return (
		<ToggleRow>
			<Stack $gap={2}>
				<Text $weight={600}>{title}</Text>
				<Text $muted $size={12}>
					{hint}
				</Text>
			</Stack>
			<Switch
				type="button"
				$on={on}
				onClick={onToggle}
				aria-label={`Toggle ${title}`}
				aria-pressed={on}
			/>
		</ToggleRow>
	);
}

export default function VendorSettingsWrapper() {
	const { toast } = useToast();
	const { user, refresh } = useAuth();
	const {
		data: vendor,
		isLoading,
		mutate,
	} = useSWR<VendorMe>("/vendors/me", fetcher);
	const { data: schools } = useSWR<School[]>("/vendors/schools", fetcher);
	const { data: campuses } = useSWR<Campus[]>("/campuses", fetcher);

	// Business identity
	const [firstName, setFirstName] = useState("");
	const [lastName, setLastName] = useState("");
	const [phone, setPhone] = useState("");
	const [phoneOtp, setPhoneOtp] = useState("");
	const [phoneOtpSent, setPhoneOtpSent] = useState(false);
	const [businessName, setBusinessName] = useState("");
	const [vendorType, setVendorType] = useState("");
	const [email, setEmail] = useState("");
	const [description, setDescription] = useState("");

	// Categories
	const [cats, setCats] = useState<string[]>([]);

	// Location
	const [locationType, setLocationType] = useState<
		"ON_CAMPUS" | "OFF_CAMPUS"
	>("ON_CAMPUS");
	const [schoolId, setSchoolId] = useState("");
	const [hostelOrStallName, setHostelOrStallName] = useState("");
	const [stateName, setStateName] = useState("");
	const [areaOrAddress, setAreaOrAddress] = useState("");
	const [campusIds, setCampusIds] = useState<string[]>([]);

	// Delivery defaults
	const [defPickup, setDefPickup] = useState(true);
	const [defDelivery, setDefDelivery] = useState(false);
	const [defFee, setDefFee] = useState("");

	// Notifications
	const [notifyNewOrders, setNotifyNewOrders] = useState(true);
	const [notifyPayouts, setNotifyPayouts] = useState(true);
	const [notifyReviews, setNotifyReviews] = useState(true);

	const [busy, setBusy] = useState<string | null>(null);

	// Seed form state once the profile loads (and whenever it changes).
	useEffect(() => {
		if (!vendor) return;
		setFirstName(user?.firstName ?? "");
		setLastName(user?.lastName ?? "");
		setPhone(user?.phone ?? "");
		setBusinessName(vendor.businessName ?? "");
		setVendorType(vendor.vendorType ?? "");
		setEmail(vendor.email ?? "");
		setDescription(vendor.description ?? "");
		setCats(vendor.categories ?? []);
		setLocationType(vendor.locationType ?? "ON_CAMPUS");
		setSchoolId(vendor.schoolId ?? "");
		setHostelOrStallName(vendor.hostelOrStallName ?? "");
		setStateName(vendor.state ?? "");
		setAreaOrAddress(vendor.areaOrAddress ?? "");
		setCampusIds(vendor.campusIds ?? []);
		setDefPickup(vendor.defaultPickupAvailable ?? true);
		setDefDelivery(vendor.defaultDeliveryAvailable ?? false);
		setDefFee(
			vendor.defaultDeliveryFeeKobo
				? String(vendor.defaultDeliveryFeeKobo / 100)
				: "",
		);
		setNotifyNewOrders(vendor.notifyNewOrders ?? true);
		setNotifyPayouts(vendor.notifyPayouts ?? true);
		setNotifyReviews(vendor.notifyReviews ?? true);
	}, [vendor, user]);

	if (isLoading || !vendor) return <PageLoader />;

	function toggleCat(v: string) {
		setCats((c) => (c.includes(v) ? c.filter((x) => x !== v) : [...c, v]));
	}

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

	async function run(section: string, fn: () => Promise<void>) {
		setBusy(section);
		try {
			await fn();
			await mutate();
		} catch (e) {
			toast(errMsg(e), "error");
		} finally {
			setBusy(null);
		}
	}

	async function saveIdentity() {
		await run("identity", async () => {
			await api.post("/vendors/me/business-identity", {
				businessName: businessName.trim(),
				...(vendorType ? { vendorType } : {}),
				...(description.trim()
					? { description: description.trim() }
					: {}),
				email: email.trim(),
			});
			toast("Business details saved", "success");
		});
	}

	async function savePersonalDetails() {
		await run("profile", async () => {
			await api.patch("/users/me", {
				firstName: firstName.trim(),
				lastName: lastName.trim(),
			});
			await refresh();
			toast("Profile details saved", "success");
		});
	}

	async function requestPhoneOtp() {
		if (!phone.trim() || phone.trim() === user?.phone) return;
		await run("phone", async () => {
			await api.post("/users/me/phone/request", { phone: phone.trim() });
			setPhoneOtpSent(true);
			toast("Verification code sent", "success");
		});
	}

	async function confirmPhone() {
		await run("phone", async () => {
			await api.post("/users/me/phone/confirm", {
				phone: phone.trim(),
				otp: phoneOtp.trim(),
			});
			setPhoneOtp("");
			setPhoneOtpSent(false);
			await refresh();
			toast("Phone number updated", "success");
		});
	}

	async function uploadProfileImage(file: File) {
		await run("image", async () => {
			const presign = await apiData<{
				uploadUrl: string;
				key: string;
			}>(
				api.post("/vendors/me/profile-image/presign", {
					mimeType: file.type,
				}),
			);
			const put = await fetch(presign.uploadUrl, {
				method: "PUT",
				body: file,
				headers: { "Content-Type": file.type },
			});
			if (!put.ok) throw new Error("Upload failed");
			await api.post("/vendors/me/profile-image/confirm", {
				key: presign.key,
			});
			toast("Profile picture updated", "success");
		});
	}

	async function saveCategories() {
		if (cats.length === 0) {
			toast("Pick at least one category", "error");
			return;
		}
		await run("categories", async () => {
			await api.post("/vendors/me/categories", { categories: cats });
			toast("Categories saved", "success");
		});
	}

	async function saveLocation() {
		await run("location", async () => {
			const body =
				locationType === "ON_CAMPUS"
					? {
							locationType,
							...(schoolId ? { schoolId } : {}),
							hostelOrStallName: hostelOrStallName.trim(),
						}
					: {
							locationType,
							state: stateName.trim(),
							areaOrAddress: areaOrAddress.trim(),
							campusIds,
						};
			await api.post("/vendors/me/location", body);
			toast("Location saved", "success");
		});
	}

	async function saveDelivery() {
		await run("delivery", async () => {
			await api.post("/vendors/me/delivery-defaults", {
				defaultPickupAvailable: defPickup,
				defaultDeliveryAvailable: defDelivery,
				defaultDeliveryFeeKobo:
					defDelivery && Number(defFee) > 0
						? Math.round(Number(defFee) * 100)
						: 0,
			});
			toast("Delivery defaults saved", "success");
		});
	}

	const stateCampuses = (campuses ?? []).filter(
		(c) =>
			stateName.trim() &&
			c.state.trim().toLowerCase() === stateName.trim().toLowerCase(),
	);

	async function saveNotifications() {
		await run("notifications", async () => {
			await api.post("/vendors/me/notification-prefs", {
				notifyNewOrders,
				notifyPayouts,
				notifyReviews,
			});
			toast("Notification preferences saved", "success");
		});
	}

	return (
		<FadeIn>
			<Stack $gap={20}>
				<PageHeader
					eyebrow="Vendor"
					title="Settings"
					subtitle="Manage your business profile, payouts, and how you get notified."
				/>

				<Card>
					<Stack $gap={14}>
						<SectionHeader title="Profile" icon="👤" />
						<Row $gap={14} $align="center" $wrap>
							<Avatar
								src={vendor.profileImageUrl}
								name={`${user?.firstName ?? ""} ${user?.lastName ?? ""}`}
								size={72}
							/>
							<Stack $gap={6}>
								<Text $weight={700}>
									{user?.firstName} {user?.lastName}
								</Text>
								<Text $muted $size={13}>
									{user?.phone}
								</Text>
								<Input
									type="file"
									accept="image/*"
									onChange={(e) => {
										const file = e.target.files?.[0];
										if (file) uploadProfileImage(file);
									}}
								/>
							</Stack>
						</Row>
						<Row $gap={12} $wrap>
							<div style={{ flex: 1, minWidth: 180 }}>
								<Input
									label="First name"
									value={firstName}
									onChange={(e) =>
										setFirstName(e.target.value)
									}
								/>
							</div>
							<div style={{ flex: 1, minWidth: 180 }}>
								<Input
									label="Last name"
									value={lastName}
									onChange={(e) =>
										setLastName(e.target.value)
									}
								/>
							</div>
						</Row>
						<Button
							$loading={busy === "profile"}
							disabled={busy === "profile" || !firstName.trim()}
							onClick={savePersonalDetails}
						>
							Save personal details
						</Button>
						<Stack $gap={10}>
							<Input
								label="Phone number"
								value={phone}
								onChange={(e) => {
									setPhone(e.target.value);
									setPhoneOtpSent(false);
								}}
							/>
							<Row $gap={10} $wrap>
								<Button
									$variant="secondary"
									$loading={busy === "phone"}
									disabled={
										busy === "phone" ||
										!phone.trim() ||
										phone.trim() === user?.phone
									}
									onClick={requestPhoneOtp}
								>
									Send verification code
								</Button>
								{phoneOtpSent && (
									<>
										<Input
											label="OTP"
											value={phoneOtp}
											onChange={(e) =>
												setPhoneOtp(e.target.value)
											}
											placeholder="6-digit code"
										/>
										<Button
											$loading={busy === "phone"}
											disabled={
												busy === "phone" ||
												phoneOtp.trim().length !== 6
											}
											onClick={confirmPhone}
										>
											Verify & update phone
										</Button>
									</>
								)}
							</Row>
						</Stack>
					</Stack>
				</Card>

				{/* Business identity */}
				<Card>
					<Stack $gap={14}>
						<SectionHeader title="Business identity" icon="🏪" />
						<Input
							label="Business name"
							value={businessName}
							onChange={(e) => setBusinessName(e.target.value)}
							placeholder="Mama T's Kitchen"
						/>
						<Select
							label="Vendor type"
							value={vendorType}
							onChange={(e) => setVendorType(e.target.value)}
						>
							<option value="">Select type…</option>
							{VENDOR_TYPES.map((t) => (
								<option key={t.value} value={t.value}>
									{t.label}
								</option>
							))}
						</Select>
						<Input
							label="Contact email"
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder="you@example.com"
						/>
						<Textarea
							label="Short description"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder="Home-style Nigerian meals, freshly cooked daily."
						/>
						<Button
							$loading={busy === "identity"}
							disabled={
								!businessName.trim() ||
								!email.trim() ||
								busy === "identity"
							}
							onClick={saveIdentity}
						>
							Save business details
						</Button>
					</Stack>
				</Card>

				{/* Categories */}
				<Card>
					<Stack $gap={14}>
						<SectionHeader title="Categories" icon="🍱" />
						<Text $muted $size={13}>
							What you sell — buyers filter by these.
						</Text>
						<CatGrid>
							{CATEGORIES.map((c) => (
								<CatChip
									key={c.value}
									type="button"
									$on={cats.includes(c.value)}
									onClick={() => toggleCat(c.value)}
								>
									{c.label}
								</CatChip>
							))}
						</CatGrid>
						<Button
							$loading={busy === "categories"}
							disabled={busy === "categories"}
							onClick={saveCategories}
						>
							Save categories
						</Button>
					</Stack>
				</Card>

				{/* Location */}
				<Card>
					<Stack $gap={14}>
						<SectionHeader title="Location" icon="📍" />
						<Select
							label="Location type"
							value={locationType}
							onChange={(e) =>
								setLocationType(
									e.target.value as
										| "ON_CAMPUS"
										| "OFF_CAMPUS",
								)
							}
						>
							<option value="ON_CAMPUS">On campus</option>
							<option value="OFF_CAMPUS">Off campus</option>
						</Select>
						{locationType === "ON_CAMPUS" ? (
							<>
								<Select
									label="School (optional)"
									value={schoolId}
									onChange={(e) =>
										setSchoolId(e.target.value)
									}
								>
									<option value="">Select school…</option>
									{(schools ?? []).map((s) => (
										<option key={s.id} value={s.id}>
											{s.name}
										</option>
									))}
								</Select>
								<Input
									label="Hostel / stall name"
									value={hostelOrStallName}
									onChange={(e) =>
										setHostelOrStallName(e.target.value)
									}
									placeholder="Block C, Room 12"
								/>
							</>
						) : (
							<>
								<Input
									label="State"
									value={stateName}
									onChange={(e) => {
										setStateName(e.target.value);
										setCampusIds([]);
									}}
									placeholder="Lagos"
								/>
								<Input
									label="Area / address"
									value={areaOrAddress}
									onChange={(e) =>
										setAreaOrAddress(e.target.value)
									}
									placeholder="12 Allen Avenue, Ikeja"
								/>
								{stateName.trim() && (
									<Stack $gap={8}>
										<Text $weight={700} $size={13}>
											Campuses to show your menu on
										</Text>
										{stateCampuses.length > 0 ? (
											<CatGrid>
												{stateCampuses.map((c) => (
													<CatChip
														key={c.id}
														type="button"
														$on={campusIds.includes(
															c.id,
														)}
														onClick={() =>
															toggleCampus(c.id)
														}
													>
														{c.name}
													</CatChip>
												))}
											</CatGrid>
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
							$loading={busy === "location"}
							disabled={
								busy === "location" ||
								(locationType === "ON_CAMPUS"
									? !hostelOrStallName.trim()
									: !stateName.trim() ||
										!areaOrAddress.trim() ||
										campusIds.length === 0)
							}
							onClick={saveLocation}
						>
							Save location
						</Button>
					</Stack>
				</Card>

				{/* Fees */}
				<Card>
					<Stack $gap={10}>
						<SectionHeader title="Fees and payments" icon="%" />
						<Text $muted $size={13}>
							Prechop charges an 8% commission on the food
							subtotal of every successful order. Buyers pay a 3%
							service fee capped at ₦200. Paystack processing fees
							are absorbed by Prechop.
						</Text>
					</Stack>
				</Card>

				{/* Bank */}
				<Card>
					<Stack $gap={14}>
						<SectionHeader title="Bank & payouts" icon="🏦" />
						<BankDetailsForm
							initialBankCode={vendor.bankCode}
							initialAccountName={vendor.accountName}
							saveLabel="Update bank details"
							onSaved={() => mutate()}
						/>
					</Stack>
				</Card>

				{/* Delivery defaults */}
				<Card>
					<Stack $gap={14}>
						<SectionHeader title="Delivery defaults" icon="🛵" />
						<Text $muted $size={13}>
							Pre-filled every time you compose a new daily order.
						</Text>
						<ToggleSetting
							title="🥡 Pickup available by default"
							hint="Buyers collect from your spot"
							on={defPickup}
							onToggle={() => setDefPickup((v) => !v)}
						/>
						<ToggleSetting
							title="🛵 Delivery available by default"
							hint="Deliver to hostels for a fee"
							on={defDelivery}
							onToggle={() => setDefDelivery((v) => !v)}
						/>
						{defDelivery && (
							<Input
								label="Default delivery fee (₦)"
								type="number"
								inputMode="decimal"
								value={defFee}
								onChange={(e) => setDefFee(e.target.value)}
								placeholder="200"
							/>
						)}
						<Button
							$loading={busy === "delivery"}
							disabled={busy === "delivery"}
							onClick={saveDelivery}
						>
							Save delivery defaults
						</Button>
					</Stack>
				</Card>

				{/* Notifications */}
				<Card>
					<Stack $gap={14}>
						<SectionHeader title="Notifications" icon="🔔" />
						<ToggleSetting
							title="New orders"
							hint="Alert me when a buyer pays for an order"
							on={notifyNewOrders}
							onToggle={() => setNotifyNewOrders((v) => !v)}
						/>
						<ToggleSetting
							title="Payouts"
							hint="Alert me about settlements and transfers"
							on={notifyPayouts}
							onToggle={() => setNotifyPayouts((v) => !v)}
						/>
						<ToggleSetting
							title="Reviews"
							hint="Alert me when a buyer reviews my kitchen"
							on={notifyReviews}
							onToggle={() => setNotifyReviews((v) => !v)}
						/>
						<Button
							$loading={busy === "notifications"}
							disabled={busy === "notifications"}
							onClick={saveNotifications}
						>
							Save notification preferences
						</Button>
					</Stack>
				</Card>

				{/* Account */}
				<Card>
					<Stack $gap={10}>
						<SectionHeader title="Account" icon="👤" />
						<Text $muted $size={13}>
							Campus, push notifications, and signing out live in
							your account.
						</Text>
						<Row $justify="flex-start">
							<AccountLink href="/account">
								Go to account <span aria-hidden>→</span>
							</AccountLink>
						</Row>
					</Stack>
				</Card>
			</Stack>
		</FadeIn>
	);
}
