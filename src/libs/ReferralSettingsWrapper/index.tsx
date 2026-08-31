"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styled from "styled-components";
import {
	Badge,
	Button,
	Card,
	FadeIn,
	Input,
	PageHeader,
	Row,
	SectionHeader,
	Stack,
	Text,
} from "@/components";
import { api } from "@/constants/api";
import { APP_URL } from "@/constants/env";
import { useToast } from "@/hooks/useToast";

const FormGrid = styled.div`
	display: grid;
	grid-template-columns: repeat(2, 1fr);
	gap: var(--pc-space-3);

	@media (max-width: 640px) {
		grid-template-columns: 1fr;
	}
`;

const StatGrid = styled.div`
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: var(--pc-space-3);

	@media (max-width: 640px) {
		grid-template-columns: 1fr;
	}
`;

const StatCard = styled(Card)`
	text-align: center;
	padding: var(--pc-space-4);
`;

interface ReferralCampaign {
	_id: string;
	vendorId: string;
	isActive: boolean;
	startDate: string;
	endDate: string;
	threshold: number;
	rewardExpiryDays: number;
	rewardType: string;
	rewardValue?: number;
	maxRewardsPerCreator?: number | null;
}

interface CreatorStat {
	creatorUserId: string;
	count: number;
	rewardsUnlocked: number;
	rewardsRedeemed: number;
}

export default function ReferralSettingsWrapper() {
	const { toast } = useToast();
	const [campaign, setCampaign] = useState<ReferralCampaign | null>(null);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [copying, setCopying] = useState(false);
	const [creators, setCreators] = useState<CreatorStat[]>([]);
	const [form, setForm] = useState({
		isActive: false,
		threshold: 10,
		rewardExpiryDays: 30,
		rewardType: "FREE_MEAL",
		rewardValue: undefined as number | undefined,
		maxRewardsPerCreator: null as number | null,
		endDate: "",
	});

	useEffect(() => {
		async function load() {
			try {
				const [campRes, creatorsRes] = await Promise.all([
					api.get("/vendors/me/referral-campaign"),
					api.get("/vendors/me/referral-creators"),
				]);
				const campData = campRes.data?.data;
				if (campData) {
					setCampaign(campData);
					setForm({
						isActive: campData.isActive ?? false,
						threshold: campData.threshold ?? 10,
						rewardExpiryDays: campData.rewardExpiryDays ?? 30,
						rewardType: campData.rewardType ?? "FREE_MEAL",
						rewardValue: campData.rewardValue,
						maxRewardsPerCreator: campData.maxRewardsPerCreator,
						endDate: campData.endDate
							? new Date(campData.endDate).toISOString().slice(0, 16)
							: "",
					});
				}
				const creatorsData = creatorsRes.data?.data;
				if (creatorsData) {
					setCreators(creatorsData);
				}
			} catch {
				// ignore
			} finally {
				setLoading(false);
			}
		}
		load();
	}, []);

	const save = async () => {
		setSaving(true);
		try {
			const body: Record<string, unknown> = {
				isActive: form.isActive,
				threshold: form.threshold,
				rewardExpiryDays: form.rewardExpiryDays,
				rewardType: form.rewardType,
				maxRewardsPerCreator: form.maxRewardsPerCreator,
			};
			if (form.endDate) {
				body.endDate = new Date(form.endDate).toISOString();
			}
			const res = await api.post("/vendors/me/referral-campaign", body);
			const updated = res.data?.data;
			if (updated) {
				setCampaign(updated);
				toast("Campaign settings saved", "success");
			} else {
				toast("Failed to save settings", "error");
			}
		} catch (error) {
			const message =
				(error as { response?: { data?: { message?: string } } })?.response
					?.data?.message ?? "Failed to save settings";
			toast(message, "error");
		} finally {
			setSaving(false);
		}
	};

	const endCampaign = async () => {
		try {
			const res = await api.post("/vendors/me/referral-campaign/end");
			const updated = res.data?.data;
			if (updated) {
				setCampaign(updated);
				setForm((f) => ({ ...f, isActive: false }));
				toast("Campaign ended", "success");
			}
		} catch (error) {
			const message =
				(error as { response?: { data?: { message?: string } } })?.response
					?.data?.message ?? "Failed to end campaign";
			toast(message, "error");
		}
	};

	const campaignLink = campaign
		? `${APP_URL.replace(/\/$/, "")}/invite/${campaign.vendorId}`
		: null;

	const copyLink = async () => {
		if (!campaignLink) return;
		try {
			await navigator.clipboard.writeText(campaignLink);
			setCopying(true);
			toast("Campaign link copied", "success");
			setTimeout(() => setCopying(false), 2000);
		} catch {
			toast("Couldn't copy link", "error");
		}
	};

	if (loading) {
		return (
			<FadeIn>
				<Stack $gap={16}>
					<PageHeader
						eyebrow="Vendor Settings"
						title="Referral Campaign"
						subtitle="Loading..."
					/>
				</Stack>
			</FadeIn>
		);
	}

	return (
		<FadeIn>
			<Stack $gap={20}>
				<PageHeader
					eyebrow="Vendor Settings"
					title="Referral Campaign"
					subtitle="Run an invite-and-earn campaign for your kitchen."
				/>

				{creators.length > 0 && (
					<StatGrid>
						<StatCard>
							<Text $weight={800} $size={28}>
								{creators.reduce((s, c) => s + c.count, 0)}
							</Text>
							<Text $muted $size={13}>
								Total referrals
							</Text>
						</StatCard>
						<StatCard>
							<Text $weight={800} $size={28}>
								{creators.reduce((s, c) => s + c.rewardsUnlocked, 0)}
							</Text>
							<Text $muted $size={13}>
								Rewards unlocked
							</Text>
						</StatCard>
						<StatCard>
							<Text $weight={800} $size={28}>
								{creators.reduce((s, c) => s + c.rewardsRedeemed, 0)}
							</Text>
							<Text $muted $size={13}>
								Rewards redeemed
							</Text>
						</StatCard>
					</StatGrid>
				)}

				<Card>
					<Stack $gap={14}>
						<SectionHeader title="Campaign settings" icon="⚙️" />
						<FormGrid>
							<div>
								<Text $weight={700} $size={13}>
									Referrals needed per reward
								</Text>
								<Input
									type="number"
									min={1}
									value={form.threshold}
									onChange={(e) =>
										setForm({ ...form, threshold: parseInt(e.target.value || "10") })
									}
								/>
							</div>
							<div>
								<Text $weight={700} $size={13}>
									Reward expiry (days)
								</Text>
								<Input
									type="number"
									min={1}
									value={form.rewardExpiryDays}
									onChange={(e) =>
										setForm({
											...form,
											rewardExpiryDays: parseInt(e.target.value || "30"),
										})
									}
								/>
							</div>
							<div>
								<Text $weight={700} $size={13}>
									Reward type
								</Text>
								<select
									value={form.rewardType}
									onChange={(e) =>
										setForm({ ...form, rewardType: e.target.value })
									}
									style={{
										width: "100%",
										height: 40,
										borderRadius: "var(--pc-radius-sm)",
										border: "1px solid var(--pc-border)",
										background: "var(--pc-surface)",
										color: "var(--pc-text)",
										padding: "0 10px",
									}}
								>
									<option value="FREE_MEAL">Free meal</option>
									<option value="PERCENT_DISCOUNT">Percent discount</option>
									<option value="FIXED_CREDIT">Fixed credit</option>
								</select>
							</div>
							<div>
								<Text $weight={700} $size={13}>
									Campaign end date
								</Text>
								<Input
									type="datetime-local"
									value={form.endDate}
									onChange={(e) =>
										setForm({ ...form, endDate: e.target.value })
									}
								/>
							</div>
						</FormGrid>
						<Row $gap={8}>
							<Button
								$size="sm"
								onClick={save}
								$loading={saving}
							>
								Save settings
							</Button>
							{campaign?.isActive && (
								<Button $size="sm" $variant="secondary" onClick={endCampaign}>
									End campaign
								</Button>
							)}
						</Row>
					</Stack>
				</Card>

				{campaignLink && (
					<Card>
						<Stack $gap={12}>
							<SectionHeader title="Campaign link" icon="🔗" />
							<Text $muted $size={13}>
								Share this link on WhatsApp Status, Instagram, or anywhere
								your audience is. Creators who sign up through it will be
								linked to your campaign.
							</Text>
							<code
								style={{
									display: "block",
									padding: "10px 12px",
									background: "var(--pc-surface-2)",
									border: "1px solid var(--pc-border)",
									borderRadius: "var(--pc-radius-sm)",
									fontSize: 13,
									wordBreak: "break-all",
								}}
							>
								{campaignLink}
							</code>
							<Row $gap={8}>
								<Button
									$size="sm"
									$variant={copying ? "secondary" : "primary"}
									onClick={copyLink}
								>
									{copying ? "Copied ✓" : "Copy link"}
								</Button>
								<Button
									$size="sm"
									$variant="secondary"
									onClick={() => {
										const text = encodeURIComponent(
											`Order from my kitchen on PreChop 👉 ${campaignLink}`,
										);
										window.open(
											`https://wa.me/?text=${text}`,
											"_blank",
											"noopener,noreferrer",
										);
									}}
								>
									Share to WhatsApp
								</Button>
							</Row>
						</Stack>
					</Card>
				)}

				<Card>
					<Stack $gap={14}>
						<SectionHeader title="Top creators" icon="🏆" />
						{creators.length === 0 ? (
							<Text $muted $size={13}>
								No referrals yet. Share your campaign to get started.
							</Text>
						) : (
							<Stack $gap={8}>
								{creators.map((c) => (
									<Row
										key={c.creatorUserId}
										$justify="space-between"
										$gap={10}
										style={{
											padding: "10px 0",
											borderBottom: "1px solid var(--pc-border)",
										}}
									>
										<Stack $gap={2}>
											<Text $size={14} $weight={700}>
												Creator
											</Text>
											<Text $muted $size={12}>
												{c.rewardsUnlocked} unlocked ·{" "}
												{c.rewardsRedeemed} redeemed
											</Text>
										</Stack>
										<Badge $tone="primary">
											{c.count} referrals
										</Badge>
									</Row>
								))}
							</Stack>
						)}
					</Stack>
				</Card>
			</Stack>
		</FadeIn>
	);
}
