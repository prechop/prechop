"use client";

import { useState } from "react";
import styled from "styled-components";
import useSWR from "swr";
import {
	Badge,
	Button,
	Card,
	FadeIn,
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
import {
	describeFeePolicy,
	describeVendorConsent,
	useFeePolicy,
} from "@/hooks/useFeePolicy";
import { useToast } from "@/hooks/useToast";
import BankDetailsForm from "@/libs/BankDetailsForm";
import type { Campus, VendorProfile } from "@/types";

// The /vendors/me payload carries more fields than the shared VendorProfile
// view-model; the extra optional fields drive the onboarding checklist.
export interface VendorMe extends VendorProfile {
	locationType?: "ON_CAMPUS" | "OFF_CAMPUS";
	campusIds?: string[];
	schoolId?: string;
	schoolNameOther?: string;
	hostelOrStallName?: string;
	state?: string;
	areaOrAddress?: string;
	bankCode?: string;
	bankName?: string;
	accountName?: string;
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

const ProgressCard = styled(Card)`
  background: var(--pc-gradient-hero);
  border: none;
  color: #fff;
  box-shadow: var(--pc-shadow-primary);
  position: relative;
  overflow: hidden;
  &::after {
    content: "";
    position: absolute;
    right: -40px;
    bottom: -50px;
    width: 170px;
    height: 170px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.1);
  }
`;
const ProgressInner = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--pc-space-3);
`;
const ProgressTop = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--pc-space-3);
`;
const ProgressPct = styled.span`
  font-family: var(--pc-font-display);
  font-size: 34px;
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1;
  color: #fff;
`;
const ProgressLabel = styled.span`
  font-size: 13.5px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.9);
`;
const Bar = styled.div`
  height: 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.22);
  overflow: hidden;
`;
const Fill = styled.div<{ $pct: number }>`
  height: 100%;
  width: ${(p) => Math.min(100, Math.max(0, p.$pct))}%;
  border-radius: 999px;
  background: #fff;
  transition: width var(--pc-dur-slow) var(--pc-ease);
`;
const StepCard = styled(Card)<{ $open: boolean }>`
  padding: 0;
  overflow: hidden;
  border-color: ${(p) =>
		p.$open ? "var(--pc-color-primary)" : "var(--pc-border)"};
  box-shadow: ${(p) => (p.$open ? "var(--pc-shadow)" : "var(--pc-shadow-sm)")};
`;
const StepHead = styled.button<{ $done: boolean }>`
  all: unset;
  box-sizing: border-box;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: var(--pc-space-4);
  cursor: pointer;
  transition: background var(--pc-dur) var(--pc-ease);
  &:hover {
    background: var(--pc-surface-2);
  }
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
  width: 32px;
  height: 32px;
  border-radius: 999px;
  font-size: 15px;
  font-weight: 800;
  flex-shrink: 0;
  background: ${(p) =>
		p.$done ? "var(--pc-color-accent)" : "var(--pc-color-primary-50)"};
  color: ${(p) => (p.$done ? "#fff" : "var(--pc-color-primary)")};
  transition: background var(--pc-dur) var(--pc-ease);
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
  padding: 12px;
  border-radius: var(--pc-radius-sm);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition:
    transform var(--pc-dur) var(--pc-ease),
    border-color var(--pc-dur) var(--pc-ease),
    background var(--pc-dur) var(--pc-ease);
  border: 1.5px solid
    ${(p) => (p.$on ? "var(--pc-color-primary)" : "var(--pc-border)")};
  background: ${(p) =>
		p.$on ? "var(--pc-color-primary-50)" : "var(--pc-surface)"};
  color: ${(p) => (p.$on ? "var(--pc-color-primary)" : "var(--pc-text)")};
  &:hover {
    transform: translateY(-1px);
    border-color: var(--pc-color-primary);
  }
`;
const FileDrop = styled.label`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: var(--pc-space-5);
  border: 1.5px dashed var(--pc-border);
  border-radius: var(--pc-radius);
  background: var(--pc-surface-2);
  cursor: pointer;
  text-align: center;
  transition: border-color var(--pc-dur) var(--pc-ease);
  &:hover {
    border-color: var(--pc-color-primary);
  }
  input {
    display: none;
  }
`;
const DropIcon = styled.span`
  font-size: 26px;
  line-height: 1;
`;
const ReviewBanner = styled.div<{ $tone: "info" | "warning" }>`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px;
  border-radius: var(--pc-radius);
  border: 1px solid
    ${(p) =>
		p.$tone === "warning"
			? "var(--pc-color-gold)"
			: "var(--pc-color-primary)"};
  background: ${(p) =>
		p.$tone === "warning"
			? "var(--pc-color-gold-50)"
			: "var(--pc-color-primary-50)"};
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
	const [campusIds, setCampusIds] = useState<string[]>(
		vendor.campusIds ?? [],
	);
	const [acceptedFeePolicy, setAcceptedFeePolicy] = useState(false);
	const { data: schools } = useSWR<School[]>(
		open === "location" ? "/vendors/schools" : null,
		fetcher,
	);
	const { data: campuses } = useSWR<Campus[]>(
		open === "location" ? "/campuses" : null,
		fetcher,
	);
	// The rate the vendor is about to consent to must be the rate they will
	// actually be charged, read from the server's effective policy. Until it
	// loads there is no rate to consent TO, so the checkbox stays disabled rather
	// than collecting agreement to an unnamed (or stale hardcoded) number.
	const { policy: feePolicy } = useFeePolicy();
	const feePolicyKnown = !!feePolicy;

	const isPending = vendor.status === "PENDING_REVIEW";
	const needsChanges = vendor.status === "CHANGES_REQUESTED";

	const done = {
		identity: !!vendor.businessName,
		categories: (vendor.categories?.length ?? 0) > 0,
		location:
			vendor.locationType === "OFF_CAMPUS"
				? !!vendor.state &&
					!!vendor.areaOrAddress &&
					(vendor.campusIds?.length ?? 0) > 0
				: !!vendor.locationType,
		bank: !!vendor.bankCode || !!vendor.paystackSubaccountCode,
		image: !!vendor.profileImageUrl,
		open: isPending || vendor.status === "ACTIVE",
	};

	// Every step except the final "submit" one must be complete before the
	// vendor can send their application for review. This mirrors the server's
	// onboarding-checklist gate (see submitForReview). It intentionally does
	// NOT require profileCompleteness === 100: that score also rewards menu
	// items + timetable entries, which live behind the active-vendor gate and
	// can only be added after approval — requiring them here would deadlock
	// every applicant.
	const detailsComplete =
		done.identity &&
		done.categories &&
		done.location &&
		done.bank &&
		done.image;

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
							campusIds,
						};
			await api.post("/vendors/me/location", body);
			toast("Location saved", "success");
			setOpen("bank");
		});
	}

	async function uploadImage(file: File) {
		await submit(async () => {
			const presign = await apiData<{
				uploadUrl: string;
				publicReadUrl: string;
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
			toast("Profile image saved", "success");
			setOpen("open");
		});
	}

	async function submitForReview() {
		await submit(async () => {
			await api.post("/vendors/me/submit", {});
			toast("Application submitted for review", "success");
		});
	}

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

	const stateCampuses = (campuses ?? []).filter(
		(c) =>
			state.trim() &&
			c.state.trim().toLowerCase() === state.trim().toLowerCase(),
	);

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
		{
			key: "open",
			label: "Submit for review",
			hint: "Admin approval before you go live",
		},
	];

	const doneCount = rows.filter(
		(r) => done[r.key as keyof typeof done],
	).length;
	const stepPct = Math.round((doneCount / rows.length) * 100);

	return (
		<FadeIn>
			<Stack $gap={16}>
				<PageHeader
					eyebrow="Welcome to Prechop"
					title="Finish setting up your kitchen"
					subtitle="Complete every step below and submit for review. An admin approves your kitchen before it goes live."
				/>

				{isPending && (
					<ReviewBanner $tone="info">
						<Text $weight={700}>⏳ Application under review</Text>
						<Text $muted $size={13}>
							Thanks for submitting! Our team is reviewing your
							details and will email you once you're approved.
						</Text>
					</ReviewBanner>
				)}
				{needsChanges && (
					<ReviewBanner $tone="warning">
						<Text $weight={700}>✏️ Changes requested</Text>
						<Text $muted $size={13}>
							{vendor.rejectionReason
								? `Reviewer note: ${vendor.rejectionReason}`
								: "Please review your details and resubmit."}
						</Text>
					</ReviewBanner>
				)}

				<ProgressCard>
					<ProgressInner>
						<ProgressTop>
							<Stack $gap={2}>
								<ProgressLabel>
									{doneCount} of {rows.length} steps done
								</ProgressLabel>
								<ProgressPct>
									{vendor.profileCompleteness ?? 0}%
								</ProgressPct>
							</Stack>
							<ProgressLabel>
								{stepPct === 100
									? "All set 🎉"
									: "Ready to go live"}
							</ProgressLabel>
						</ProgressTop>
						<Bar>
							<Fill $pct={stepPct} />
						</Bar>
					</ProgressInner>
				</ProgressCard>

				{rows.map((r) => {
					const isOpen = open === r.key;
					const isDone = done[r.key as keyof typeof done];
					return (
						<StepCard key={r.key} $open={isOpen}>
							<StepHead
								$done={isDone}
								onClick={() => setOpen(isOpen ? null : r.key)}
							>
								<Row $gap={12}>
									<Dot $done={isDone}>
										{isDone ? "✓" : ""}
									</Dot>
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
													setBusinessName(
														e.target.value,
													)
												}
												placeholder="Mama T's Kitchen"
											/>
											<Select
												label="Vendor type"
												value={vendorType}
												onChange={(e) =>
													setVendorType(
														e.target.value,
													)
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
													setDescription(
														e.target.value,
													)
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
												Save & continue
											</Button>
										</Stack>
									)}

									{r.key === "categories" && (
										<Stack $gap={12}>
											<Text $muted $size={13}>
												Pick everything you sell — you
												can change this later.
											</Text>
											<CatGrid>
												{CATEGORIES.map((c) => (
													<CatChip
														key={c.value}
														$on={cats.includes(
															c.value,
														)}
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
												Save & continue
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
														value={
															hostelOrStallName
														}
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
														onChange={(e) => {
															setState(
																e.target.value,
															);
															setCampusIds([]);
														}}
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
													{state.trim() && (
														<Stack $gap={8}>
															<Text
																$weight={700}
																$size={13}
															>
																Campuses to show
																your menu on
															</Text>
															{stateCampuses.length >
															0 ? (
																<CatGrid>
																	{stateCampuses.map(
																		(c) => (
																			<CatChip
																				key={
																					c.id
																				}
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
																				{
																					c.name
																				}
																			</CatChip>
																		),
																	)}
																</CatGrid>
															) : (
																<Text
																	$muted
																	$size={13}
																>
																	No active
																	campuses
																	found for
																	this state.
																</Text>
															)}
															<Text
																$muted
																$size={12}
															>
																{
																	campusIds.length
																}
																/3 selected
															</Text>
														</Stack>
													)}
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
															!areaOrAddress.trim() ||
															campusIds.length ===
																0
												}
											>
												Save & continue
											</Button>
										</Stack>
									)}

									{r.key === "bank" && (
										<Stack $gap={12}>
											<Text $muted $size={13}>
												Verify your account, confirm the
												name, then save. This is where
												your payouts land.
											</Text>
											<BankDetailsForm
												initialBankCode={
													vendor.bankCode
												}
												initialAccountName={
													vendor.accountName
												}
												saveLabel="Save & continue"
												onSaved={() => {
													onChanged();
													setOpen("image");
												}}
											/>
										</Stack>
									)}

									{r.key === "image" && (
										<Stack $gap={12}>
											<Text $muted $size={13}>
												Upload a clear photo of your
												food or storefront (JPG, PNG or
												WebP).
											</Text>
											<FileDrop>
												<DropIcon aria-hidden>
													📸
												</DropIcon>
												<Text $weight={700} $size={14}>
													Tap to upload a photo
												</Text>
												<Text $muted $size={12}>
													A great photo helps buyers
													choose you
												</Text>
												<input
													type="file"
													accept="image/jpeg,image/png,image/webp"
													disabled={busy}
													onChange={(e) => {
														const f =
															e.target.files?.[0];
														if (f) uploadImage(f);
													}}
												/>
											</FileDrop>
										</Stack>
									)}

									{r.key === "open" && (
										<Stack $gap={12}>
											{isPending ? (
												<Text $muted $size={13}>
													Your application is being
													reviewed by our team. We'll
													email you as soon as it's
													approved.
												</Text>
											) : (
												<Stack $gap={10}>
													<Text $muted $size={13}>
														Once every step above is
														complete, submit your
														kitchen for review. An
														admin will check your
														details before you go
														live.
													</Text>
													<Text $muted $size={13}>
														{describeFeePolicy(
															feePolicy,
														)}
													</Text>
													<label
														style={{
															display: "flex",
															alignItems:
																"flex-start",
															gap: 8,
															fontSize: 13,
															color: "var(--pc-text-muted)",
															fontWeight: 700,
															cursor: feePolicyKnown
																? "pointer"
																: "not-allowed",
															opacity:
																feePolicyKnown
																	? 1
																	: 0.6,
														}}
													>
														<input
															type="checkbox"
															checked={
																acceptedFeePolicy &&
																feePolicyKnown
															}
															disabled={
																!feePolicyKnown
															}
															onChange={(e) =>
																setAcceptedFeePolicy(
																	e.target
																		.checked,
																)
															}
														/>
														{feePolicyKnown
															? describeVendorConsent(
																	feePolicy,
																)
															: "Loading the current commission rate…"}
													</label>
												</Stack>
											)}
											<Button
												$full
												$loading={busy}
												disabled={
													busy ||
													isPending ||
													!detailsComplete ||
													!acceptedFeePolicy ||
													!feePolicyKnown
												}
												onClick={submitForReview}
											>
												{isPending
													? "Under review…"
													: detailsComplete
														? !feePolicyKnown
															? "Loading fee policy…"
															: acceptedFeePolicy
																? "Submit for review"
																: "Accept fee policy first"
														: "Complete all steps first"}
											</Button>
										</Stack>
									)}
								</StepBody>
							)}
						</StepCard>
					);
				})}
			</Stack>
		</FadeIn>
	);
}
