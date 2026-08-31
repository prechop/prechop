"use client";

import { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import Link from "next/link";
import {
	Badge,
	Button,
	Card,
	FadeIn,
	PageHeader,
	Row,
	SectionHeader,
	Stack,
	Text,
} from "@/components";
import { api } from "@/constants/api";
import { useAuth } from "@/hooks/Auth/useAuth";
import { useToast } from "@/hooks/useToast";

const Hero = styled(Card)`
	text-align: center;
	background: var(--pc-gradient-calm-orange);
	border: none;
	color: #fff;
	padding: var(--pc-space-6) var(--pc-space-4);
`;

const Steps = styled.div`
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: var(--pc-space-3);
	margin-top: var(--pc-space-4);

	@media (max-width: 640px) {
		grid-template-columns: 1fr;
	}
`;

const Step = styled.div`
	background: var(--pc-surface-2);
	border: 1px solid var(--pc-border);
	border-radius: var(--pc-radius);
	padding: var(--pc-space-3);
	text-align: center;
`;

const StepNum = styled.div`
	font-size: 28px;
	margin-bottom: var(--pc-space-2);
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
}

function cameFromLogin(): boolean {
	if (typeof window === "undefined") return false;
	const params = new URLSearchParams(window.location.search);
	return params.get("next")?.startsWith("/invite/") ?? false;
}

function daysRemaining(endDate: string | null): number | null {
	if (!endDate) return null;
	const now = new Date();
	const end = new Date(endDate);
	const diff = end.getTime() - now.getTime();
	if (diff <= 0) return 0;
	return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export default function ReferralCampaignPage({
	params,
}: {
	params: Promise<{ vendorId: string }>;
}) {
	const { user, isLoading: authLoading, isAuthenticated, refresh } = useAuth();
	const { toast } = useToast();
	const [vendorId, setVendorId] = useState<string>("");
	const [vendorName, setVendorName] = useState<string>("");
	const [loading, setLoading] = useState(true);
	const [creatorLink, setCreatorLink] = useState<string | null>(null);
	const [copying, setCopying] = useState(false);
	const [linkLoading, setLinkLoading] = useState(false);
	const [linkError, setLinkError] = useState<string | null>(null);
	const [dashboard, setDashboard] = useState<CreatorDashboard | null>(null);
	const didRevalidateRef = useRef(false);

	useEffect(() => {
		async function load() {
			const resolvedVendorId = (await params).vendorId;
			setVendorId(resolvedVendorId);
			try {
				const res = await api.get(
					`/vendors/${resolvedVendorId}/storefront`,
				);
				if (res.status === 200) {
					const data = res.data;
					setVendorName(data.businessName ?? "our kitchen");
				}
			} catch {
				// best-effort
			} finally {
				setLoading(false);
			}
		}
		load();
	}, [params]);

	useEffect(() => {
		if (didRevalidateRef.current) return;
		if (!cameFromLogin()) return;
		didRevalidateRef.current = true;
		refresh();
	}, [refresh]);

	useEffect(() => {
		if (authLoading || !vendorId) return;

		if (!isAuthenticated) {
			setCreatorLink(null);
			setLinkLoading(false);
			setLinkError(null);
			setDashboard(null);
			return;
		}

		setLinkLoading(true);
		setLinkError(null);

		api.get("/referral/me/stats", { params: { vendorId } })
			.then((res) => {
				const payload = res.data?.data;
				if (payload?.hasLink && payload?.link?.url) {
					setCreatorLink(payload.link.url);
					setDashboard(payload.dashboard ?? null);
				} else {
					setLinkError("Could not load your invite link");
				}
			})
			.catch((err) => {
				const message =
					(err as { response?: { data?: { message?: string } } })?.response
						?.data?.message || "Could not load your invite link";
				setLinkError(message);
			})
			.finally(() => {
				setLinkLoading(false);
			});
	}, [isAuthenticated, authLoading, vendorId]);

	const shareText = creatorLink
		? `I found a way to eat free from ${vendorName || "this kitchen"} 👀 Use my link when you order — trust me. ${creatorLink}`
		: "";

	const copyLink = async () => {
		if (!creatorLink) return;
		try {
			await navigator.clipboard.writeText(creatorLink);
			setCopying(true);
			toast("Link copied", "success");
			setTimeout(() => setCopying(false), 2000);
		} catch {
			toast("Couldn't copy — long-press the link to copy it", "error");
		}
	};

	const shareWhatsApp = () => {
		if (!creatorLink) return;
		const text = encodeURIComponent(shareText);
		window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
	};

	const retryLink = () => {
		if (!isAuthenticated || !vendorId) return;
		setLinkLoading(true);
		setLinkError(null);
		api.get("/referral/me/stats", { params: { vendorId } })
			.then((res) => {
				const payload = res.data?.data;
				if (payload?.hasLink && payload?.link?.url) {
					setCreatorLink(payload.link.url);
					setDashboard(payload.dashboard ?? null);
				} else {
					setLinkError("Could not load your invite link");
				}
			})
			.catch((err) => {
				const message =
					(err as { response?: { data?: { message?: string } } })?.response
						?.data?.message || "Could not load your invite link";
				setLinkError(message);
			})
			.finally(() => {
				setLinkLoading(false);
			});
	};

	if (loading || authLoading) {
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

	const isAuthenticatedUser = isAuthenticated && !!creatorLink;
	const days = dashboard ? daysRemaining(dashboard.campaignEndDate) : null;
	const progressPct = dashboard
		? Math.min(
				100,
				Math.round(
					(dashboard.progressToNext.current / dashboard.progressToNext.needed) *
						100,
				),
			)
		: 0;

	return (
		<FadeIn>
			<Stack $gap={20}>
				<Hero>
					<Stack $gap={6}>
						<Text $weight={800} $size={26} style={{ color: "#fff" }}>
							Bring 10 friends. Eat free.
						</Text>
						<Text $size={15} style={{ color: "rgba(255,255,255,0.9)" }}>
							{isAuthenticatedUser
								? `Track your referrals and rewards from ${vendorName || "this kitchen"}.`
								: `Share your link from ${vendorName || "this kitchen"}. Every 10
							friends who place their first order through your link unlocks a
							free meal — and it keeps going.`}
						</Text>
						{days !== null && days > 0 && (
							<Badge $tone="primary" style={{ marginTop: 8, alignSelf: "center" }}>
								{days} days left in this campaign
							</Badge>
						)}
					</Stack>
				</Hero>

				{!isAuthenticatedUser && (
					<Card>
						<Stack $gap={14}>
							<Text $weight={700} $size={15}>
								How it works
							</Text>
							<Steps>
								<Step>
									<StepNum>1</StepNum>
									<Text $weight={600}>Get your link</Text>
									<Text $muted $size={13}>
										Sign in and generate your personal invite link.
									</Text>
								</Step>
								<Step>
									<StepNum>2</StepNum>
									<Text $weight={600}>Share it</Text>
									<Text $muted $size={13}>
										Send it to friends on WhatsApp, Instagram, or anywhere.
									</Text>
								</Step>
								<Step>
									<StepNum>3</StepNum>
									<Text $weight={600}>Earn free meals</Text>
									<Text $muted $size={13}>
										Every 10 first orders through your link = 1 free meal reward.
									</Text>
								</Step>
							</Steps>
						</Stack>
					</Card>
				)}

				{isAuthenticatedUser && dashboard && (
					<>
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
					</>
				)}

				<Card>
					<Stack $gap={12}>
						<SectionHeader title="Your invite link" icon="🔗" />
						{creatorLink ? (
							<>
								<Text $muted $size={13}>
									{isAuthenticatedUser
										? "Share this link. When 10 friends place their first order, you unlock a free meal."
										: "Sign in to get your personal invite link and start earning free meals."}
								</Text>
								<Stack $gap={8}>
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
										{creatorLink}
									</code>
									<Row $gap={8}>
										<Button
											$size="sm"
											$variant={copying ? "secondary" : "primary"}
											onClick={copyLink}
										>
											{copying ? "Copied ✓" : "Copy link"}
										</Button>
										<Button $size="sm" $variant="secondary" onClick={shareWhatsApp}>
											Share to WhatsApp
										</Button>
									</Row>
								</Stack>
							</>
						) : linkLoading ? (
							<Text $muted $size={13}>
								Generating your invite link...
							</Text>
						) : linkError ? (
							<Stack $gap={10}>
								<Text $muted $size={13}>
									{linkError}
								</Text>
								<Button $size="sm" $variant="secondary" onClick={retryLink}>
									Try again
								</Button>
							</Stack>
						) : (
							<Stack $gap={10}>
								<Text $muted $size={13}>
									Sign in to get your personal invite link and start earning
									free meals.
								</Text>
								<Link href={`/login?next=/invite/${vendorId}`}>
									<Button $full>Sign in to get my link</Button>
								</Link>
							</Stack>
						)}
					</Stack>
				</Card>
			</Stack>
		</FadeIn>
	);
}
