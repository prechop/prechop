"use client";

import { useEffect, useState } from "react";
import styled from "styled-components";
import useSWR from "swr";
import {
	Badge,
	Button,
	Card,
	FadeIn,
	Input,
	PageHeader,
	SectionHeader,
	Skeleton,
	Stack,
	Text,
} from "@/components";
import { api } from "@/constants/api";
import { MAX_FEE_CAP_KOBO, MAX_FEE_PERCENT } from "@/constants/fees";
import { formatKobo } from "@/constants/formatters";
import { describeFeePolicy } from "@/hooks/useFeePolicy";
import { useToast } from "@/hooks/useToast";

interface SiteConfigs {
	// The retired `platformFeeBuyerKobo`/`platformFeeVendorKobo` flat fields are
	// deliberately gone: they defaulted to 0 and nothing in the pricing path read
	// them.
	//
	// These three ARE the live pricing policy — the same values `placeOrder`
	// charges with and the buyer's checkout quote reads over
	// `GET /api/site-configs/marketplace`. Editing them here moves real money.
	platformFeeBuyerPercent: number;
	platformFeeBuyerMaxKobo: number;
	platformFeeVendorPercent: number;
	slotHoldTtlSeconds: number;
	abandonedOrderMinutes: number;
	reviewWindowHours: number;
	cutoffWarningMinutes: number;
	whatsappTvEnabled: boolean;
	marketplaceEnabled: boolean;
	reviewsEnabled: boolean;
	ordersKillSwitch: boolean;
	paymentsKillSwitch: boolean;
	profileCompletenessRequired: number;
}

const Section = styled(Card)`
	display: flex;
	flex-direction: column;
	gap: var(--pc-space-4);
`;
const Toggle = styled.label`
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: 12px;
	padding: 14px 0;
	border-bottom: 1px solid var(--pc-border);
	font-size: 14.5px;
	font-weight: 700;
	color: var(--pc-text);
	cursor: pointer;
	&:last-child {
		border-bottom: none;
	}
`;
const ToggleText = styled.span`
	display: flex;
	flex-direction: column;
	gap: 3px;
`;
const ToggleHint = styled.span`
	font-size: 12.5px;
	font-weight: 500;
	color: var(--pc-text-muted);
`;
const Switch = styled.span<{ $danger?: boolean }>`
	position: relative;
	display: inline-flex;
	flex: 0 0 auto;
	width: 46px;
	height: 26px;
	input {
		position: absolute;
		inset: 0;
		margin: 0;
		opacity: 0;
		cursor: pointer;
	}
	.track {
		position: absolute;
		inset: 0;
		background: var(--pc-surface-3);
		border-radius: var(--pc-radius-pill);
		transition: background var(--pc-dur) var(--pc-ease);
		pointer-events: none;
	}
	.track::after {
		content: "";
		position: absolute;
		top: 3px;
		left: 3px;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: #fff;
		box-shadow: var(--pc-shadow-sm);
		transition: transform var(--pc-dur) var(--pc-ease);
	}
	input:checked + .track {
		background: ${(p) =>
			p.$danger ? "var(--pc-color-danger)" : "var(--pc-color-primary)"};
	}
	input:checked + .track::after {
		transform: translateX(20px);
	}
`;
const Grid2 = styled.div`
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
	gap: var(--pc-space-4);
`;
/** Full-strength `--pc-text`, not `$muted`: on the tinted `--pc-surface-2` the
 *  muted token measures 4.38:1 in light theme — under the 4.5:1 AA floor. The
 *  muted token only clears AA against the plain `--pc-surface`. */
const PolicySummary = styled(Text)`
	padding: 12px 14px;
	border-radius: var(--pc-radius-sm);
	background: var(--pc-surface-2);
	border-left: 3px solid var(--pc-color-primary);
	color: var(--pc-text);
`;

/* ------------------------------------------------------------------ fee form */

type FeeField =
	| "platformFeeBuyerPercent"
	| "platformFeeBuyerMaxKobo"
	| "platformFeeVendorPercent";
type FeeDraft = Record<FeeField, string>;

const FEE_FIELDS: FeeField[] = [
	"platformFeeBuyerPercent",
	"platformFeeBuyerMaxKobo",
	"platformFeeVendorPercent",
];

/**
 * Fee inputs are held as raw STRINGS and validated before save — unlike the
 * order-policy fields below, which use `Number(e.target.value) || 0`.
 *
 * That shortcut is safe for a TTL and catastrophic for a fee. `Number("")` is
 * `0`, so an admin who clears the field to retype it would, on save, silently
 * ship a 0% fee — every subsequent order free. The server rejects `"5"` (a
 * string) for the same reason: coercion cannot distinguish "cleared" from
 * "zero". So the parse happens exactly once, here, after validation, and an
 * unparseable field blocks the save instead of defaulting.
 *
 * An explicit, intentional `0` IS honoured — that is a real zero-fee promo, and
 * the whole point of the distinction above.
 */
function validateFee(field: FeeField, raw: string): string | null {
	const trimmed = raw.trim();
	// Checked BEFORE Number(), which would turn "" into a plausible 0.
	if (trimmed === "") return "Required. Enter 0 for no fee.";
	const value = Number(trimmed);
	if (!Number.isFinite(value)) return "Must be a number.";
	if (value < 0) return "Cannot be negative.";
	if (field === "platformFeeBuyerMaxKobo") {
		if (!Number.isInteger(value))
			return "Must be a whole number of kobo — there is no sub-kobo coin.";
		if (value > MAX_FEE_CAP_KOBO)
			return `Cannot exceed ${formatKobo(MAX_FEE_CAP_KOBO)}.`;
		return null;
	}
	if (value > MAX_FEE_PERCENT) return `Cannot exceed ${MAX_FEE_PERCENT}%.`;
	return null;
}

/** Echo a kobo amount back in naira. Kobo-vs-naira is precisely where a fee
 *  edit goes wrong — a stray zero is a 10× cap — so the admin sees the real
 *  money value of what they typed, live, next to the field. */
function koboPreview(raw: string): string {
	const trimmed = raw.trim();
	const value = Number(trimmed);
	if (trimmed === "" || !Number.isInteger(value) || value < 0) return "";
	return ` That is ${formatKobo(value)} per order.`;
}

export default function AdminSettingsWrapper() {
	const { toast } = useToast();
	const { data, isLoading, mutate } = useSWR<SiteConfigs>(
		"/admin/site-configs",
	);
	const [form, setForm] = useState<SiteConfigs | null>(null);
	const [feeDraft, setFeeDraft] = useState<FeeDraft | null>(null);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		if (!data) return;
		setForm(data);
		setFeeDraft({
			platformFeeBuyerPercent: String(data.platformFeeBuyerPercent),
			platformFeeBuyerMaxKobo: String(data.platformFeeBuyerMaxKobo),
			platformFeeVendorPercent: String(data.platformFeeVendorPercent),
		});
	}, [data]);

	function set<K extends keyof SiteConfigs>(key: K, value: SiteConfigs[K]) {
		setForm((f) => (f ? { ...f, [key]: value } : f));
	}

	function setFee(field: FeeField, value: string) {
		setFeeDraft((d) => (d ? { ...d, [field]: value } : d));
	}

	const feeErrors: Record<FeeField, string | null> = {
		platformFeeBuyerPercent: feeDraft
			? validateFee(
					"platformFeeBuyerPercent",
					feeDraft.platformFeeBuyerPercent,
				)
			: null,
		platformFeeBuyerMaxKobo: feeDraft
			? validateFee(
					"platformFeeBuyerMaxKobo",
					feeDraft.platformFeeBuyerMaxKobo,
				)
			: null,
		platformFeeVendorPercent: feeDraft
			? validateFee(
					"platformFeeVendorPercent",
					feeDraft.platformFeeVendorPercent,
				)
			: null,
	};
	const hasFeeErrors = FEE_FIELDS.some((f) => feeErrors[f] !== null);

	async function save() {
		if (!form || !feeDraft) return;
		// Never PATCH a partially-valid fee policy: the server takes each field
		// independently, so sending the two that parsed would half-apply an edit
		// the admin never confirmed.
		if (hasFeeErrors) {
			toast("Fix the highlighted fee fields before saving.", "error");
			return;
		}
		setBusy(true);
		try {
			await api.patch("/admin/site-configs", {
				// JSON numbers, not strings — the server rejects `"5"` outright
				// rather than coerce it. Safe to `Number()` here: every field has
				// just passed `validateFee`, so none is empty or unparseable.
				platformFeeBuyerPercent: Number(
					feeDraft.platformFeeBuyerPercent,
				),
				platformFeeBuyerMaxKobo: Number(
					feeDraft.platformFeeBuyerMaxKobo,
				),
				platformFeeVendorPercent: Number(
					feeDraft.platformFeeVendorPercent,
				),
				slotHoldTtlSeconds: Math.round(form.slotHoldTtlSeconds),
				abandonedOrderMinutes: Math.round(form.abandonedOrderMinutes),
				reviewWindowHours: Math.round(form.reviewWindowHours),
				cutoffWarningMinutes: Math.round(form.cutoffWarningMinutes),
				whatsappTvEnabled: form.whatsappTvEnabled,
				marketplaceEnabled: form.marketplaceEnabled,
				reviewsEnabled: form.reviewsEnabled,
				ordersKillSwitch: form.ordersKillSwitch,
				paymentsKillSwitch: form.paymentsKillSwitch,
				profileCompletenessRequired: Math.round(
					form.profileCompletenessRequired,
				),
			});
			toast("Settings saved", "success");
			await mutate();
		} catch (err: any) {
			toast(
				err.response?.data?.message ?? "Could not save settings",
				"error",
			);
		} finally {
			setBusy(false);
		}
	}

	if (isLoading || !form || !feeDraft)
		return (
			<Stack $gap={4}>
				<PageHeader
					eyebrow="Configuration"
					title="Settings"
					subtitle="Platform-wide policy, fees and kill switches."
				/>
				<Stack $gap={16}>
					{Array.from({ length: 4 }).map((_, i) => (
						<Card key={i}>
							<Stack $gap={14}>
								<Skeleton $w="180px" $h={20} />
								<Skeleton $h={44} />
								<Skeleton $h={44} />
							</Stack>
						</Card>
					))}
				</Stack>
			</Stack>
		);

	return (
		<Stack $gap={4}>
			<PageHeader
				eyebrow="Configuration"
				title="Settings"
				subtitle="Platform-wide policy, fees and kill switches."
				actions={
					<Button
						$pill
						$loading={busy}
						disabled={busy || hasFeeErrors}
						onClick={save}
					>
						Save changes
					</Button>
				}
			/>

			<FadeIn>
				<Stack $gap={16}>
					<Section>
						<SectionHeader title="Platform fees" icon="💰" />
						{/* Derived from the SAVED config, never hardcoded: this is
						    the same policy the buyer's checkout quote and the
						    vendor's commission notice read, so all three move
						    together the moment this form is saved. */}
						<PolicySummary $size={13}>
							<strong>In effect now:</strong>{" "}
							{describeFeePolicy({
								buyerPercent:
									data?.platformFeeBuyerPercent ?? 0,
								buyerMaxKobo:
									data?.platformFeeBuyerMaxKobo ?? 0,
								vendorPercent:
									data?.platformFeeVendorPercent ?? 0,
							})}
						</PolicySummary>
						<Grid2>
							<Input
								label="Buyer service fee (percent)"
								type="number"
								step="0.01"
								inputMode="decimal"
								value={feeDraft.platformFeeBuyerPercent}
								error={feeErrors.platformFeeBuyerPercent}
								hint="Percent of the food subtotal, added at checkout and paid by the buyer. Fractions allowed (e.g. 2.5). Enter 0 for no buyer fee."
								onChange={(e) =>
									setFee(
										"platformFeeBuyerPercent",
										e.target.value,
									)
								}
							/>
							<Input
								label="Buyer service fee cap (kobo)"
								type="number"
								step="1"
								inputMode="numeric"
								value={feeDraft.platformFeeBuyerMaxKobo}
								error={feeErrors.platformFeeBuyerMaxKobo}
								hint={`Whole kobo, not naira — 100 kobo = ₦1.${koboPreview(
									feeDraft.platformFeeBuyerMaxKobo,
								)} The buyer's fee never exceeds this, however large the order.`}
								onChange={(e) =>
									setFee(
										"platformFeeBuyerMaxKobo",
										e.target.value,
									)
								}
							/>
							<Input
								label="Vendor commission (percent)"
								type="number"
								step="0.01"
								inputMode="decimal"
								value={feeDraft.platformFeeVendorPercent}
								error={feeErrors.platformFeeVendorPercent}
								hint="Percent of the food subtotal, deducted from the vendor's payout. Uncapped. Enter 0 for no commission."
								onChange={(e) =>
									setFee(
										"platformFeeVendorPercent",
										e.target.value,
									)
								}
							/>
						</Grid2>
						<Text $muted $size={12.5}>
							These rates apply to orders placed after you save.
							Orders already paid keep the fee they were charged.
							Paystack processing fees are absorbed by Prechop.
						</Text>
					</Section>

					<Section>
						<SectionHeader title="Order policy" icon="⏱️" />
						<Grid2>
							<Input
								label="Slot hold TTL (seconds)"
								type="number"
								value={form.slotHoldTtlSeconds.toString()}
								onChange={(e) =>
									set(
										"slotHoldTtlSeconds",
										Number(e.target.value) || 0,
									)
								}
							/>
							<Input
								label="Abandoned order (minutes)"
								type="number"
								value={form.abandonedOrderMinutes.toString()}
								onChange={(e) =>
									set(
										"abandonedOrderMinutes",
										Number(e.target.value) || 0,
									)
								}
							/>
							<Input
								label="Review window (hours)"
								type="number"
								value={form.reviewWindowHours.toString()}
								onChange={(e) =>
									set(
										"reviewWindowHours",
										Number(e.target.value) || 0,
									)
								}
							/>
							<Input
								label="Cutoff warning (minutes)"
								type="number"
								value={form.cutoffWarningMinutes.toString()}
								onChange={(e) =>
									set(
										"cutoffWarningMinutes",
										Number(e.target.value) || 0,
									)
								}
							/>
							<Input
								label="Profile completeness required (%)"
								type="number"
								value={form.profileCompletenessRequired.toString()}
								onChange={(e) =>
									set(
										"profileCompletenessRequired",
										Number(e.target.value) || 0,
									)
								}
							/>
						</Grid2>
					</Section>

					<Section>
						<SectionHeader title="Feature flags" icon="🚩" />
						<div>
							<Toggle>
								<ToggleText>
									Marketplace enabled
									<ToggleHint>
										Buyers can browse and place orders.
									</ToggleHint>
								</ToggleText>
								<Switch>
									<input
										type="checkbox"
										checked={form.marketplaceEnabled}
										onChange={(e) =>
											set(
												"marketplaceEnabled",
												e.target.checked,
											)
										}
									/>
									<span className="track" />
								</Switch>
							</Toggle>
							<Toggle>
								<ToggleText>
									Reviews enabled
									<ToggleHint>
										Buyers can leave reviews after orders.
									</ToggleHint>
								</ToggleText>
								<Switch>
									<input
										type="checkbox"
										checked={form.reviewsEnabled}
										onChange={(e) =>
											set(
												"reviewsEnabled",
												e.target.checked,
											)
										}
									/>
									<span className="track" />
								</Switch>
							</Toggle>
							<Toggle>
								<ToggleText>
									WhatsApp TV enabled
									<ToggleHint>
										Promote listings through WhatsApp TVs.
									</ToggleHint>
								</ToggleText>
								<Switch>
									<input
										type="checkbox"
										checked={form.whatsappTvEnabled}
										onChange={(e) =>
											set(
												"whatsappTvEnabled",
												e.target.checked,
											)
										}
									/>
									<span className="track" />
								</Switch>
							</Toggle>
						</div>
					</Section>

					<Section>
						<SectionHeader
							title="Kill switches"
							icon="🛑"
							action={
								<Text $muted $size={13}>
									Use with caution
								</Text>
							}
						/>
						<div>
							<Toggle>
								<ToggleText>
									<span>
										Orders kill switch{" "}
										{form.ordersKillSwitch && (
											<Badge $tone="danger">ON</Badge>
										)}
									</span>
									<ToggleHint>
										Immediately halts all new orders.
									</ToggleHint>
								</ToggleText>
								<Switch $danger>
									<input
										type="checkbox"
										checked={form.ordersKillSwitch}
										onChange={(e) =>
											set(
												"ordersKillSwitch",
												e.target.checked,
											)
										}
									/>
									<span className="track" />
								</Switch>
							</Toggle>
							<Toggle>
								<ToggleText>
									<span>
										Payments kill switch{" "}
										{form.paymentsKillSwitch && (
											<Badge $tone="danger">ON</Badge>
										)}
									</span>
									<ToggleHint>
										Immediately halts all payment capture.
									</ToggleHint>
								</ToggleText>
								<Switch $danger>
									<input
										type="checkbox"
										checked={form.paymentsKillSwitch}
										onChange={(e) =>
											set(
												"paymentsKillSwitch",
												e.target.checked,
											)
										}
									/>
									<span className="track" />
								</Switch>
							</Toggle>
						</div>
					</Section>
				</Stack>
			</FadeIn>
		</Stack>
	);
}
