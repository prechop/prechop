"use client";

import Link from "next/link";
import styled from "styled-components";
import useSWR from "swr";
import {
	Card,
	EmptyState,
	FadeIn,
	PageHeader,
	Row,
	SectionHeader,
	Stack,
	Text,
} from "@/components";
import { fetcher } from "@/constants/fetcher";
import type { FeedItem } from "@/types";

interface FollowingResponse {
	vendorIds: string[];
}

const Section = styled(Card)`
	padding: var(--pc-space-5);
`;

const FeedList = styled.div`
	display: flex;
	flex-direction: column;
`;

const FeedItemRow = styled(Link)<{ $unread?: boolean }>`
	display: flex;
	gap: 12px;
	padding: 14px 0;
	border-bottom: 1px solid var(--pc-border);
	text-decoration: none;
	color: inherit;
	&:last-child {
		border-bottom: none;
	}
	&:hover {
		background: var(--pc-surface-2);
	}
`;

const Dot = styled.span<{ $unread?: boolean }>`
	flex: 0 0 auto;
	width: 9px;
	height: 9px;
	margin-top: 6px;
	border-radius: 50%;
	background: ${(p) =>
		p.$unread ? "var(--pc-color-primary)" : "var(--pc-border)"};
`;

const VendorRow = styled(Link)`
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 12px 0;
	border-bottom: 1px solid var(--pc-border);
	text-decoration: none;
	color: inherit;
	&:last-child {
		border-bottom: none;
	}
	&:hover {
		background: var(--pc-surface-2);
	}
`;

const VendorThumb = styled.div`
	width: 40px;
	height: 40px;
	border-radius: var(--pc-radius-sm);
	background: var(--pc-gradient-warm);
	display: grid;
	place-items: center;
	font-size: 18px;
	flex-shrink: 0;
`;

const VendorName = styled.span`
	font-weight: 700;
	font-size: 14px;
	color: var(--pc-text);
`;

const VendorMeta = styled.span`
	font-size: 12px;
	color: var(--pc-text-muted);
	font-weight: 600;
`;

const FeedItemBody = styled.div`
	flex: 1;
	min-width: 0;
`;

const VendorBody = styled.div`
	flex: 1;
	min-width: 0;
`;

export default function FeedWrapper() {
	const { data: feedData } = useSWR<{ items: FeedItem[] }>(
		"buyers/me/feed",
		fetcher,
		{ refreshInterval: 60_000 },
	);
	const { data: followingData } = useSWR<FollowingResponse>(
		"vendors/me/following",
		fetcher,
		{ refreshInterval: 60_000 },
	);
	const items = feedData?.items ?? [];
	const followingIds = followingData?.vendorIds ?? [];

	return (
		<FadeIn>
			<Stack $gap={16}>
				<PageHeader
					eyebrow="Feed"
					title="Your feed"
					subtitle="Updates from kitchens you follow."
				/>
				<Stack $gap={18}>
					<Section>
						<Stack $gap={12}>
							<Row
								$justify="space-between"
								$align="center"
								$gap={12}
							>
								<Text $weight={800}>Recent updates</Text>
							</Row>
							{items.length === 0 ? (
								<EmptyState
									icon="📰"
									title="No updates yet"
									description="Follow kitchens to see their new menus and updates here."
								/>
							) : (
								<FeedList>
									{items.map((item) => (
										<FeedItemRow
											key={item.id}
											href={`/v/${item.vendorId}`}
										>
											<Dot aria-hidden />
											<FeedItemBody>
												<Text $weight={700} $size={14}>
													New menu posted
												</Text>
												<Text $muted $size={13}>
													{item.title}
												</Text>
												<Text $muted $size={12}>
													{new Date(
														item.createdAt,
													).toLocaleString()}
												</Text>
											</FeedItemBody>
										</FeedItemRow>
									))}
								</FeedList>
							)}
						</Stack>
					</Section>

					<Section>
						<Stack $gap={12}>
							<SectionHeader title="Kitchens you follow" />
							{followingIds.length === 0 ? (
								<EmptyState
									icon="♡"
									title="No followed kitchens yet"
									description="Kitchens you follow will appear here."
								/>
							) : (
								<FeedList>
									{followingIds.map((id) => (
										<VendorRow key={id} href={`/v/${id}`}>
											<VendorThumb aria-hidden>
												🍲
											</VendorThumb>
											<VendorBody>
												<VendorName>
													Kitchen {id.slice(-6)}
												</VendorName>
												<VendorMeta>
													View kitchen
												</VendorMeta>
											</VendorBody>
										</VendorRow>
									))}
								</FeedList>
							)}
						</Stack>
					</Section>
				</Stack>
			</Stack>
		</FadeIn>
	);
}
