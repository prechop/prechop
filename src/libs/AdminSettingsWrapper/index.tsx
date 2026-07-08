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

	if (isLoading || !form)
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

	// Fees are kobo on the wire; display in naira, convert back on change.
	const nairaInput = (kobo: number) => (kobo / 100).toString();
	const toKobo = (naira: string) => Math.round((Number(naira) || 0) * 100);

	return (
		<Stack $gap={4}>
			<PageHeader
				eyebrow="Configuration"
				title="Settings"
				subtitle="Platform-wide policy, fees and kill switches."
				actions={
					<Button $pill $loading={busy} onClick={save}>
						Save changes
					</Button>
				}
			/>

			<FadeIn>
				<Stack $gap={16}>
					<Section>
						<SectionHeader title="Platform fees" icon="💰" />
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
