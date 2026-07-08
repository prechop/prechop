"use client";

import { useEffect, useState } from "react";
import styled from "styled-components";
import useSWR from "swr";
import {
	Button,
	Card,
	Heading,
	Input,
	PageLoader,
	Row,
	Stack,
	Text,
	Title,
} from "@/components";
import { api } from "@/constants/api";
import { useToast } from "@/hooks/useToast";

interface SiteConfigs {
	platformFeeBuyerKobo: number;
	platformFeeVendorKobo: number;
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
	padding: 10px 0;
	border-bottom: 1px solid var(--pc-border);
	font-size: 14px;
	font-weight: 600;
	&:last-child {
		border-bottom: none;
	}
`;
const Grid2 = styled.div`
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
	gap: var(--pc-space-4);
`;
const Danger = styled.span`
	color: var(--pc-color-danger);
	font-size: 12px;
	font-weight: 600;
`;

export default function AdminSettingsWrapper() {
	const { toast } = useToast();
	const { data, isLoading, mutate } = useSWR<SiteConfigs>(
		"/admin/site-configs",
	);
	const [form, setForm] = useState<SiteConfigs | null>(null);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		if (data) setForm(data);
	}, [data]);

	function set<K extends keyof SiteConfigs>(key: K, value: SiteConfigs[K]) {
		setForm((f) => (f ? { ...f, [key]: value } : f));
	}

	async function save() {
		if (!form) return;
		setBusy(true);
		try {
			await api.patch("/admin/site-configs", {
				platformFeeBuyerKobo: Math.round(form.platformFeeBuyerKobo),
				platformFeeVendorKobo: Math.round(form.platformFeeVendorKobo),
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

	if (isLoading || !form) return <PageLoader />;

	// Fees are kobo on the wire; display in naira, convert back on change.
	const nairaInput = (kobo: number) => (kobo / 100).toString();
	const toKobo = (naira: string) => Math.round((Number(naira) || 0) * 100);

	return (
		<Stack $gap={4}>
			<Row $justify="space-between">
				<Heading $size={26}>Settings</Heading>
				<Button $loading={busy} onClick={save}>
					Save changes
				</Button>
			</Row>
			<Text $muted>Platform-wide policy, fees and kill switches.</Text>

			<Stack $gap={16} style={{ marginTop: "var(--pc-space-5)" }}>
				<Section>
					<Title $size={17}>Platform fees</Title>
					<Grid2>
						<Input
							label="Buyer fee (₦)"
							type="number"
							step="0.01"
							value={nairaInput(form.platformFeeBuyerKobo)}
							onChange={(e) =>
								set(
									"platformFeeBuyerKobo",
									toKobo(e.target.value),
								)
							}
						/>
						<Input
							label="Vendor fee (₦)"
							type="number"
							step="0.01"
							value={nairaInput(form.platformFeeVendorKobo)}
							onChange={(e) =>
								set(
									"platformFeeVendorKobo",
									toKobo(e.target.value),
								)
							}
						/>
					</Grid2>
				</Section>

				<Section>
					<Title $size={17}>Order policy</Title>
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
					<Title $size={17}>Feature flags</Title>
					<div>
						<Toggle>
							<span>Marketplace enabled</span>
							<input
								type="checkbox"
								checked={form.marketplaceEnabled}
								onChange={(e) =>
									set("marketplaceEnabled", e.target.checked)
								}
							/>
						</Toggle>
						<Toggle>
							<span>Reviews enabled</span>
							<input
								type="checkbox"
								checked={form.reviewsEnabled}
								onChange={(e) =>
									set("reviewsEnabled", e.target.checked)
								}
							/>
						</Toggle>
						<Toggle>
							<span>WhatsApp TV enabled</span>
							<input
								type="checkbox"
								checked={form.whatsappTvEnabled}
								onChange={(e) =>
									set("whatsappTvEnabled", e.target.checked)
								}
							/>
						</Toggle>
					</div>
				</Section>

				<Section>
					<Title $size={17}>Kill switches</Title>
					<div>
						<Toggle>
							<span>
								Orders kill switch{" "}
								{form.ordersKillSwitch && <Danger>· ON</Danger>}
							</span>
							<input
								type="checkbox"
								checked={form.ordersKillSwitch}
								onChange={(e) =>
									set("ordersKillSwitch", e.target.checked)
								}
							/>
						</Toggle>
						<Toggle>
							<span>
								Payments kill switch{" "}
								{form.paymentsKillSwitch && (
									<Danger>· ON</Danger>
								)}
							</span>
							<input
								type="checkbox"
								checked={form.paymentsKillSwitch}
								onChange={(e) =>
									set("paymentsKillSwitch", e.target.checked)
								}
							/>
						</Toggle>
					</div>
				</Section>
			</Stack>
		</Stack>
	);
}
