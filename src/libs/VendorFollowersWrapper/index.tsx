"use client";

import Link from "next/link";
import { useMemo } from "react";
import styled from "styled-components";
import useSWR from "swr";
import {
	Badge,
	Card,
	FadeIn,
	PageHeader,
	Row,
	SectionHeader,
	Stack,
	Text,
} from "@/components";
import { PageLoader } from "@/components/Loader";
import { fetcher } from "@/constants/fetcher";

const Page = styled.div`
	background: var(--pc-vendor-bg);
	min-height: 100%;
`;

const TopBar = styled.div`
	display: flex;
	align-items: center;
	gap: var(--pc-space-3);
	padding: var(--pc-space-4) var(--pc-space-5) 0;
`;

const BackLink = styled(Link)`
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 36px;
	height: 36px;
	border-radius: var(--pc-radius-pill);
	background: var(--pc-vendor-surface);
	border: 1px solid var(--pc-vendor-border);
	color: var(--pc-text);
	font-size: 18px;
	transition: background var(--pc-dur) var(--pc-ease), border-color var(--pc-dur) var(--pc-ease);
	&:hover {
		border-color: var(--pc-color-primary);
		background: var(--pc-vendor-surface-2);
	}
`;

const PageTitle = styled.h1`
	font-family: var(--pc-font-display);
	font-size: 22px;
	font-weight: 800;
	letter-spacing: -0.02em;
	color: var(--pc-text);
`;

const StatsGrid = styled.div`
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: var(--pc-space-3);
	margin-top: var(--pc-space-4);
`;

const StatCard = styled.div`
	background: var(--pc-vendor-surface);
	border: 1px solid var(--pc-vendor-border);
	border-radius: var(--pc-radius);
	padding: var(--pc-space-4);
	display: flex;
	flex-direction: column;
	gap: 4px;
`;

const StatValue = styled.span`
	font-family: var(--pc-font-display);
	font-size: 28px;
	font-weight: 800;
	color: var(--pc-text);
`;

const StatLabel = styled.span`
	font-size: 12px;
	font-weight: 700;
	color: var(--pc-text-muted);
	text-transform: uppercase;
	letter-spacing: 0.06em;
`;

const FollowerRow = styled.div`
	display: flex;
	align-items: center;
	gap: var(--pc-space-3);
	padding: var(--pc-space-3) 0;
	border-bottom: 1px solid var(--pc-vendor-border);
	&:last-child {
		border-bottom: none;
	}
`;

const FollowerAvatar = styled.div`
	width: 40px;
	height: 40px;
	border-radius: var(--pc-radius-sm);
	background: var(--pc-gradient-warm);
	display: grid;
	place-items: center;
	font-size: 16px;
	font-weight: 800;
	color: #fff;
	flex-shrink: 0;
`;

const FollowerInfo = styled.div`
	display: flex;
	flex-direction: column;
	gap: 2px;
	flex: 1;
	min-width: 0;
`;

const FollowerName = styled.span`
	font-size: 14px;
	font-weight: 700;
	color: var(--pc-text);
`;

const FollowerMeta = styled.span`
	font-size: 12px;
	font-weight: 600;
	color: var(--pc-text-muted);
`;

function followerInitials(name?: string): string {
	const clean = (name || "Buyer").trim();
	const parts = clean.split(/\s+/);
	return `${parts[0]?.[0] ?? "B"}${parts[1]?.[0] ?? ""}`.toUpperCase();
}

export default function VendorFollowersWrapper() {
	const { data: followersData, isLoading: followersLoading } = useSWR<{
		count: number;
		newThisWeek: number;
		followers: Array<{
			id: string;
			buyerId: string;
			createdAt: string;
		}>;
	}>("vendors/me/followers", fetcher, {
		refreshInterval: 30_000,
	});

	const isLoading = followersLoading;
	const count = followersData?.count ?? 0;
	const newThisWeek = followersData?.newThisWeek ?? 0;
	const followers = followersData?.followers ?? [];

	const milestone = useMemo(() => {
		const thresholds = [50, 100, 500, 1000, 2500, 5000, 10000];
		const current = thresholds.find((t) => count < t) ?? 10000;
		const prev = thresholds[thresholds.indexOf(current) - 1] ?? 0;
		const progress =
			current === 10000 ? 1 : (count - prev) / (current - prev);
		return { current, prev, progress, reached: progress >= 1 };
	}, [count]);

	if (isLoading) return <PageLoader />;

	return (
		<Page>
			<FadeIn>
				<Stack $gap={16}>
					<TopBar>
						<BackLink href="/vendor/more" aria-label="Back">
							←
						</BackLink>
						<PageTitle>Followers & Growth</PageTitle>
					</TopBar>

					<PageHeader
						eyebrow="Growth"
						title="Your followers"
						subtitle="Buyers following your kitchen"
					/>

					<StatsGrid>
						<StatCard>
							<StatValue>{count}</StatValue>
							<StatLabel>Total followers</StatLabel>
						</StatCard>
						<StatCard>
							<StatValue>+{newThisWeek}</StatValue>
							<StatLabel>New this week</StatLabel>
						</StatCard>
					</StatsGrid>

					<Card>
						<Stack $gap={10}>
							<SectionHeader title="Milestone progress" />
							<Text $muted $size={13}>
								{count} of {milestone.current} followers ·{" "}
								{milestone.current - count} more to reach your
								next milestone
							</Text>
							<Row $gap={10} $align="center">
								<Badge
									$tone={
										milestone.reached ? "success" : "gold"
									}
								>
									{milestone.reached
										? "Milestone reached!"
										: `${milestone.current} followers`}
								</Badge>
							</Row>
						</Stack>
					</Card>

					<Card>
						<Stack $gap={10}>
							<SectionHeader title="Recent followers" />
							{followers.length === 0 ? (
								<Text $muted $size={13}>
									No followers yet. Share your kitchen to grow
									your audience.
								</Text>
							) : (
								followers.map((f) => (
									<FollowerRow key={f.id}>
										<FollowerAvatar aria-hidden>
											{followerInitials(f.buyerId)}
										</FollowerAvatar>
										<FollowerInfo>
											<FollowerName>
												Buyer {f.buyerId.slice(-6)}
											</FollowerName>
											<FollowerMeta>
												Followed{" "}
												{new Date(
													f.createdAt,
												).toLocaleDateString()}
											</FollowerMeta>
										</FollowerInfo>
									</FollowerRow>
								))
							)}
						</Stack>
					</Card>
				</Stack>
			</FadeIn>
		</Page>
	);
}
