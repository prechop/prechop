"use client";

import { useState } from "react";
import styled from "styled-components";
import useSWR from "swr";
import {
	Badge,
	Button,
	Card,
	Input,
	Row,
	Select,
	Stack,
	Text,
	Textarea,
	Title,
} from "@/components";
import { api, apiData } from "@/constants/api";
import { fetcher } from "@/constants/fetcher";
import { useToast } from "@/hooks/useToast";
import type { VendorProfile } from "@/types";

// The /vendors/me payload carries more fields than the shared VendorProfile
// view-model; the extra optional fields drive the onboarding checklist.
export interface VendorMe extends VendorProfile {
	locationType?: "ON_CAMPUS" | "OFF_CAMPUS";
	schoolId?: string;
	schoolNameOther?: string;
	hostelOrStallName?: string;
	state?: string;
	areaOrAddress?: string;
	bankCode?: string;
	bankName?: string;
	accountName?: string;
}

interface Bank {
	name: string;
	code: string;
	active: boolean;
}
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

const StepCard = styled(Card)`
	padding: 0;
	overflow: hidden;
`;
const StepHead = styled.button`
	all: unset;
	box-sizing: border-box;
	width: 100%;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: var(--pc-space-4);
	cursor: pointer;
`;
const StepBody = styled.div`
	padding: 0 var(--pc-space-4) var(--pc-space-4);
	border-top: 1px solid var(--pc-border);
	padding-top: var(--pc-space-4);
`;
const Dot = styled.span<{ $done: boolean }>`
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 26px;
	height: 26px;
	border-radius: 999px;
	font-size: 14px;
	font-weight: 700;
	flex-shrink: 0;
	background: ${(p) =>
		p.$done ? "var(--pc-color-success)" : "var(--pc-surface-2)"};
	color: ${(p) => (p.$done ? "#fff" : "var(--pc-text-muted)")};
`;
const CatGrid = styled.div`
	display: grid;
	grid-template-columns: repeat(2, 1fr);
	gap: 8px;
`;
const CatChip = styled.button<{ $on: boolean }>`
	all: unset;
	box-sizing: border-box;
	text-align: center;
	padding: 10px;
	border-radius: var(--pc-radius-sm);
	font-size: 14px;
	font-weight: 600;
	cursor: pointer;
	border: 1px solid
		${(p) => (p.$on ? "var(--pc-color-primary)" : "var(--pc-border)")};
	background: ${(p) =>
		p.$on ? "var(--pc-color-primary-50)" : "var(--pc-surface)"};
	color: ${(p) => (p.$on ? "var(--pc-color-primary)" : "var(--pc-text)")};
`;

function errMsg(e: unknown): string {
	const m = (e as { response?: { data?: { message?: string } } })?.response
		?.data?.message;
	return m ?? "Something went wrong. Please try again.";
}

export default function VendorOnboardingWrapper({
	vendor,
	onChanged,
}: {
	vendor: VendorMe;
	onChanged: () => void;
}) {
	const { toast } = useToast();
	const [open, setOpen] = useState<string | null>("identity");
	const [busy, setBusy] = useState(false);

	// Step 1 — business identity
	const [businessName, setBusinessName] = useState(vendor.businessName ?? "");
	const [vendorType, setVendorType] = useState(vendor.vendorType ?? "");
	const [email, setEmail] = useState(vendor.email ?? "");
	const [description, setDescription] = useState(vendor.description ?? "");

	// Step 2 — categories
	const [cats, setCats] = useState<string[]>(vendor.categories ?? []);

	// Step 3 — location
	const [locationType, setLocationType] = useState<
		"ON_CAMPUS" | "OFF_CAMPUS"
	>(vendor.locationType ?? "ON_CAMPUS");
	const [schoolId, setSchoolId] = useState(vendor.schoolId ?? "");
	const [hostelOrStallName, setHostelOrStallName] = useState(
		vendor.hostelOrStallName ?? "",
	);
	const [state, setState] = useState(vendor.state ?? "");
	const [areaOrAddress, setAreaOrAddress] = useState(
		vendor.areaOrAddress ?? "",
	);

	// Step 4 — bank details
	const [bankCode, setBankCode] = useState(vendor.bankCode ?? "");
	const [accountNumber, setAccountNumber] = useState("");

	const { data: banks } = useSWR<Bank[]>(
		open === "bank" ? "/vendors/banks" : null,
		fetcher,
	);
	const { data: schools } = useSWR<School[]>(
		open === "location" ? "/vendors/schools" : null,
		fetcher,
	);

	const done = {
		identity: !!vendor.businessName,
		categories: (vendor.categories?.length ?? 0) > 0,
		location: !!vendor.locationType,
		bank: !!vendor.bankCode || !!vendor.paystackSubaccountCode,
		image: !!vendor.profileImageUrl,
		open: vendor.isOpenForOrders,
	};

	async function submit(fn: () => Promise<void>) {
		setBusy(true);
		try {
			await fn();
			onChanged();
		} catch (e) {
			toast(errMsg(e), "error");
		} finally {
			setBusy(false);
		}
	}

	async function saveIdentity() {
		await submit(async () => {
			await api.post("/vendors/me/business-identity", {
				businessName: businessName.trim(),
				...(vendorType ? { vendorType } : {}),
				...(description.trim()
					? { description: description.trim() }
					: {}),
				email: email.trim(),
			});
			toast("Business details saved", "success");
			setOpen("categories");
		});
	}

	async function saveCategories() {
		if (cats.length === 0) {
			toast("Pick at least one category", "error");
			return;
		}
		await submit(async () => {
			await api.post("/vendors/me/categories", { categories: cats });
			toast("Categories saved", "success");
			setOpen("location");
		});
	}

	async function saveLocation() {
		await submit(async () => {
			const body =
				locationType === "ON_CAMPUS"
					? {
							locationType,
							...(schoolId ? { schoolId } : {}),
							hostelOrStallName: hostelOrStallName.trim(),
						}
					: {
							locationType,
							state: state.trim(),
							areaOrAddress: areaOrAddress.trim(),
						};
			await api.post("/vendors/me/location", body);
			toast("Location saved", "success");
			setOpen("bank");
		});
	}

	async function saveBank() {
		await submit(async () => {
			const chosen = banks?.find((b) => b.code === bankCode);
			await api.post("/vendors/me/bank-details", {
				bankCode,
				accountNumber: accountNumber.trim(),
				...(chosen ? { bankName: chosen.name } : {}),
			});
			toast("Bank details saved", "success");
			setOpen("image");
		});
	}

	async function uploadImage(file: File) {
		await submit(async () => {
			const presign = await apiData<{
				uploadUrl: string;
				publicReadUrl: string;
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
				imageUrl: presign.publicReadUrl,
			});
			toast("Profile image saved", "success");
			setOpen("open");
		});
	}

	async function setOpenForOrders(next: boolean) {
		await submit(async () => {
			await api.patch("/vendors/me/open-status", {
				isOpenForOrders: next,
			});
			toast(next ? "You're open for orders" : "Marked closed", "success");
		});
	}

	function toggleCat(v: string) {
		setCats((c) => (c.includes(v) ? c.filter((x) => x !== v) : [...c, v]));
	}

	const rows: { key: string; label: string; hint: string }[] = [
		{
			key: "identity",
			label: "Business identity",
			hint: "Name, type & email",
		},
		{ key: "categories", label: "Categories", hint: "What you sell" },
		{ key: "location", label: "Location", hint: "Where buyers find you" },
		{ key: "bank", label: "Bank details", hint: "Where you get paid" },
		{ key: "image", label: "Profile image", hint: "Your storefront photo" },
		{ key: "open", label: "Go live", hint: "Open for orders" },
	];

	return (
		<Stack $gap={16}>
			<Stack $gap={6}>
				<Title $size={22}>Finish setting up your kitchen</Title>
				<Text $muted>
					Complete every step to start posting daily orders. Profile{" "}
					{vendor.profileCompleteness ?? 0}% ready.
				</Text>
			</Stack>

			{rows.map((r) => {
				const isOpen = open === r.key;
				const isDone = done[r.key as keyof typeof done];
				return (
					<StepCard key={r.key}>
						<StepHead
							onClick={() => setOpen(isOpen ? null : r.key)}
						>
							<Row $gap={12}>
								<Dot $done={isDone}>{isDone ? "✓" : ""}</Dot>
								<Stack $gap={2}>
									<Text $weight={700}>{r.label}</Text>
									<Text $muted $size={13}>
										{r.hint}
									</Text>
								</Stack>
							</Row>
							<Badge $tone={isDone ? "success" : "muted"}>
								{isDone ? "Done" : "To do"}
							</Badge>
						</StepHead>

						{isOpen && (
							<StepBody>
								{r.key === "identity" && (
									<Stack $gap={12}>
										<Input
											label="Business name"
											value={businessName}
											onChange={(e) =>
												setBusinessName(e.target.value)
											}
											placeholder="Mama T's Kitchen"
										/>
										<Select
											label="Vendor type"
											value={vendorType}
											onChange={(e) =>
												setVendorType(e.target.value)
											}
										>
											<option value="">
												Select type…
											</option>
											{VENDOR_TYPES.map((t) => (
												<option
													key={t.value}
													value={t.value}
												>
													{t.label}
												</option>
											))}
										</Select>
										<Input
											label="Contact email"
											type="email"
											value={email}
											onChange={(e) =>
												setEmail(e.target.value)
											}
											placeholder="you@example.com"
										/>
										<Textarea
											label="Short description (optional)"
											value={description}
											onChange={(e) =>
												setDescription(e.target.value)
											}
											placeholder="Home-style Nigerian meals, freshly cooked daily."
										/>
										<Button
											$full
											$loading={busy}
											onClick={saveIdentity}
											disabled={
												!businessName.trim() ||
												!email.trim()
											}
										>
											Save
										</Button>
									</Stack>
								)}

								{r.key === "categories" && (
									<Stack $gap={12}>
										<CatGrid>
											{CATEGORIES.map((c) => (
												<CatChip
													key={c.value}
													$on={cats.includes(c.value)}
													onClick={() =>
														toggleCat(c.value)
													}
													type="button"
												>
													{c.label}
												</CatChip>
											))}
										</CatGrid>
										<Button
											$full
											$loading={busy}
											onClick={saveCategories}
										>
											Save
										</Button>
									</Stack>
								)}

								{r.key === "location" && (
									<Stack $gap={12}>
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
											<option value="ON_CAMPUS">
												On campus
											</option>
											<option value="OFF_CAMPUS">
												Off campus
											</option>
										</Select>
										{locationType === "ON_CAMPUS" ? (
											<>
												<Select
													label="School (optional)"
													value={schoolId}
													onChange={(e) =>
														setSchoolId(
															e.target.value,
														)
													}
												>
													<option value="">
														Select school…
													</option>
													{(schools ?? []).map(
														(s) => (
															<option
																key={s.id}
																value={s.id}
															>
																{s.name}
															</option>
														),
													)}
												</Select>
												<Input
													label="Hostel / stall name"
													value={hostelOrStallName}
													onChange={(e) =>
														setHostelOrStallName(
															e.target.value,
														)
													}
													placeholder="Block C, Room 12"
												/>
											</>
										) : (
											<>
												<Input
													label="State"
													value={state}
													onChange={(e) =>
														setState(e.target.value)
													}
													placeholder="Lagos"
												/>
												<Input
													label="Area / address"
													value={areaOrAddress}
													onChange={(e) =>
														setAreaOrAddress(
															e.target.value,
														)
													}
													placeholder="12 Allen Avenue, Ikeja"
												/>
											</>
										)}
										<Button
											$full
											$loading={busy}
											onClick={saveLocation}
											disabled={
												locationType === "ON_CAMPUS"
													? !hostelOrStallName.trim()
													: !state.trim() ||
														!areaOrAddress.trim()
											}
										>
											Save
										</Button>
									</Stack>
								)}

								{r.key === "bank" && (
									<Stack $gap={12}>
										<Select
											label="Bank"
											value={bankCode}
											onChange={(e) =>
												setBankCode(e.target.value)
											}
										>
											<option value="">
												Select bank…
											</option>
											{(banks ?? []).map((b) => (
												<option
													key={b.code}
													value={b.code}
												>
													{b.name}
												</option>
											))}
										</Select>
										<Input
											label="Account number"
											inputMode="numeric"
											value={accountNumber}
											onChange={(e) =>
												setAccountNumber(e.target.value)
											}
											placeholder="0123456789"
										/>
										<Button
											$full
											$loading={busy}
											onClick={saveBank}
											disabled={
												!bankCode ||
												!accountNumber.trim()
											}
										>
											Save
										</Button>
									</Stack>
								)}

								{r.key === "image" && (
									<Stack $gap={12}>
										<Text $muted $size={13}>
											Upload a clear photo of your food or
											storefront (JPG, PNG or WebP).
										</Text>
										<input
											type="file"
											accept="image/jpeg,image/png,image/webp"
											disabled={busy}
											onChange={(e) => {
												const f = e.target.files?.[0];
												if (f) uploadImage(f);
											}}
										/>
									</Stack>
								)}

								{r.key === "open" && (
									<Stack $gap={12}>
										<Text $muted $size={13}>
											When you're ready, open your kitchen
											so buyers can order.
										</Text>
										<Button
											$full
											$loading={busy}
											$variant={
												vendor.isOpenForOrders
													? "secondary"
													: "primary"
											}
											onClick={() =>
												setOpenForOrders(
													!vendor.isOpenForOrders,
												)
											}
										>
											{vendor.isOpenForOrders
												? "Close for orders"
												: "Open for orders"}
										</Button>
									</Stack>
								)}
							</StepBody>
						)}
					</StepCard>
				);
			})}
		</Stack>
	);
}
