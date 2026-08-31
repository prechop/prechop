"use client";

import { useEffect, useState } from "react";
import styled from "styled-components";
import Link from "next/link";
import {
	Badge,
	Button,
	Card,
	FadeIn,
	PageHeader,
	Row,
	Stack,
	Text,
} from "@/components";
import { api } from "@/constants/api";
import { useToast } from "@/hooks/useToast";

const Hero = styled(Card)`
	text-align: center;
	background: var(--pc-gradient-calm-orange);
	border: none;
	color: #fff;
	padding: var(--pc-space-5) var(--pc-space-4);
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

const RewardCard = styled(Card)<{ $redeemed?: boolean }>`
	padding: var(--pc-space-3) var(--pc-space-4);
	opacity: ${(p) => (p.$redeemed ? 0.6 : 1)};
	border-color: ${(p) => (p.$redeemed ? "var(--pc-border)" : "var(--pc-color-primary)")};
`;

interface CreatorDashboard {
	hasLink: boolean;
	link: { token: string; url: string } | null;
	dashboard: {
		totalReferrals: number;
		rewardsUnlocked: number;
		rewardsRedeemed: number;
		availableRewards: Array<{
			_id: string;
			rewardNumber: number;
			unlockedAt: string;
			expiresAt: string;
			rewardSnapshot: {
				threshold: number;
				rewardType: string;
				rewardExpiryDays: number;
			};
		}>;
		progressToNext: { current: number; needed: number };
		campaignEndDate: string | null;
	};
}

export default function ReferralDashboard() {
	const { toast } = useToast();
	const [data, setData] = useState<CreatorDashboard | null>(null);
	const [loading, setLoading] = useState(true);
	const [copying, setCopying] = useState(false);

	useEffect(() => {
		async function load() {
			try {
				const res = await api.get("/referral/me/stats");
				const data = res.data?.data;
				if (data) {
					setData(data);
				}
			} catch {
				// ignore
			} finally {
				setLoading(false);
			}
		}
		load();
	}, []);

	const copyLink = async () => {
		if (!data?.link?.url) return;
		try {
			await navigator.clipboard.writeText(data.link.url);
			setCopying(true);
			toast("Link copied", "success");
			setTimeout(() => setCopying(false), 2000);
		} catch {
			toast("Couldn't copy", "error");
		}
	};

	if (loading) {
		return (
			<FadeIn>
				<Stack $gap={16}>
					<PageHeader
						eyebrow="Referral Campaign"
						title="Loading..."
						subtitle=""
					/>
				</Stack>
			</FadeIn>
		);
	}

	if (!data?.hasLink || !data.dashboard) {
		return (
			<FadeIn>
				<Stack $gap={16}>
					<PageHeader
						eyebrow="Referral Campaign"
						title="Referral Dashboard"
						subtitle="Get your invite link to start earning free meals."
					/>
					<Card>
						<Stack $gap={12}>
							<Text $muted $size={14}>
								You need a referral link to view your dashboard. Visit a
								campaign page to create one.
							</Text>
							<Link href="/marketplace">
								<Button>Browse campaigns</Button>
							</Link>
						</Stack>
					</Card>
				</Stack>
			</FadeIn>
		);
	}

	const { dashboard, link } = data;
	const progressPct = Math.min(
		100,
		Math.round((dashboard.progressToNext.current / dashboard.progressToNext.needed) * 100),
	);

	const campaignEnd = dashboard.campaignEndDate
		? new Date(dashboard.campaignEndDate)
		: null;
	const daysRemaining = campaignEnd
		? Math.max(0, Math.ceil((campaignEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
		: null;

	return (
		<FadeIn>
			<Stack $gap={20}>
				<PageHeader
					eyebrow="Referral Campaign"
					title="Your Dashboard"
					subtitle="Track your referrals and free meal rewards."
				/>

			<Hero>
				<Stack $gap={6}>
					<Text $weight={800} $size={22} style={{ color: "#fff" }}>
						{dashboard.totalReferrals} referrals so far
					</Text>
					<Text $size={14} style={{ color: "rgba(255,255,255,0.9)" }}>
						{dashboard.rewardsUnlocked} free meals unlocked ·{" "}
						{dashboard.rewardsRedeemed} redeemed
					</Text>
					{daysRemaining !== null && (
						<Text $size={13} style={{ color: "rgba(255,255,255,0.85)" }}>
							{daysRemaining > 0
								? `${daysRemaining} days left in this campaign`
								: "Campaign has ended"}
						</Text>
					)}
				</Stack>
			</Hero>

				<StatGrid>
					<StatCard>
						<Text $weight={800} $size={28}>
							{dashboard.totalReferrals}
						</Text>
						<Text $muted $size={13}>
							Total referrals
						</Text>
					</StatCard>
					<StatCard>
						<Text $weight={800} $size={28}>
							{dashboard.rewardsUnlocked}
						</Text>
						<Text $muted $size={13}>
							Rewards unlocked
						</Text>
					</StatCard>
					<StatCard>
						<Text $weight={800} $size={28}>
							{dashboard.rewardsRedeemed}
						</Text>
						<Text $muted $size={13}>
							Rewards redeemed
						</Text>
					</StatCard>
				</StatGrid>

				<Card>
					<Stack $gap={12}>
						<Text $weight={700} $size={15}>
							Progress to next reward
						</Text>
						<Text $muted $size={13}>
							{dashboard.progressToNext.current} of{" "}
							{dashboard.progressToNext.needed} referrals
						</Text>
						<div
							style={{
								width: "100%",
								height: 8,
								borderRadius: 999,
								background: "var(--pc-surface-2)",
								overflow: "hidden",
							}}
						>
							<div
								style={{
									width: `${progressPct}%`,
									height: "100%",
									borderRadius: 999,
									background: "var(--pc-color-primary)",
								}}
							/>
						</div>
					</Stack>
				</Card>

				<Card>
					<Stack $gap={12}>
						<Text $weight={700} $size={15}>
							Your invite link
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
							{link?.url}
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
										`I found a way to eat free 👀 Use my link when you order — trust me. ${link?.url}`,
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

				{dashboard.availableRewards.length > 0 && (
					<Card>
						<Stack $gap={12}>
							<Text $weight={700} $size={15}>
								Available rewards
							</Text>
							<Stack $gap={8}>
								{dashboard.availableRewards.map((reward) => (
									<RewardCard key={reward._id}>
										<Row $justify="space-between" $gap={10}>
											<Stack $gap={2}>
												<Text $weight={600}>
													Reward #{reward.rewardNumber}
												</Text>
												<Text $muted $size={12}>
													Expires{" "}
													{new Date(
														reward.expiresAt,
													).toLocaleDateString()}
												</Text>
											</Stack>
											<Badge $tone="success">
												{reward.rewardSnapshot.rewardType.replace("_", " ")}
											</Badge>
										</Row>
									</RewardCard>
								))}
							</Stack>
						</Stack>
					</Card>
				)}
			</Stack>
		</FadeIn>
	);
}
