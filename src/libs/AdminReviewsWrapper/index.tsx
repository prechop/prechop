"use client";

import { useState } from "react";
import styled from "styled-components";
import useSWR from "swr";
import {
	Badge,
	Button,
	Card,
	EmptyState,
	FadeIn,
	Grid,
	PageHeader,
	Row,
	Skeleton,
	Stack,
	StatCard,
	Text,
} from "@/components";
import { api } from "@/constants/api";
import { formatDate } from "@/constants/formatters";
import { useToast } from "@/hooks/useToast";

interface FlaggedReview {
	id: string;
	vendorId: string;
	buyerId: string;
	rating: number;
	comment?: string;
	tags: string[];
	isFlagged: boolean;
	createdAt: string;
}

const ReviewCard = styled(Card)`
	display: flex;
	flex-direction: column;
	gap: 12px;
	position: relative;
	overflow: hidden;
`;
const Quote = styled.blockquote`
	margin: 0;
	padding: var(--pc-space-3) var(--pc-space-4);
	background: var(--pc-surface-2);
	border-left: 3px solid var(--pc-color-primary);
	border-radius: var(--pc-radius-sm);
	font-size: 14px;
	color: var(--pc-text);
	line-height: 1.5;
`;
const NoComment = styled(Text)`
	font-style: italic;
`;
const Stars = styled.span`
	display: inline-flex;
	align-items: baseline;
	gap: 6px;
	font-weight: 700;
	& > .filled {
		color: var(--pc-color-gold);
		letter-spacing: 1px;
	}
	& > .empty {
		color: var(--pc-border);
		letter-spacing: 1px;
	}
`;
const TagRow = styled(Row)`
	flex-wrap: wrap;
`;
const Divider = styled.div`
	height: 1px;
	background: var(--pc-border);
`;

function LoadingGrid() {
	return (
		<Grid $min={300} $gap={16}>
			{[0, 1, 2].map((i) => (
				<Card key={i}>
					<Stack $gap={12}>
						<Row $justify="space-between">
							<Skeleton $w="90px" $h={18} />
							<Skeleton $w="70px" $h={22} $radius="999px" />
						</Row>
						<Skeleton $h={48} $radius="10px" />
						<Skeleton $w="40%" $h={12} />
						<Row $gap={10}>
							<Skeleton $w="80px" $h={32} $radius="10px" />
							<Skeleton $w="80px" $h={32} $radius="10px" />
						</Row>
					</Stack>
				</Card>
			))}
		</Grid>
	);
}

export default function AdminReviewsWrapper() {
	const { toast } = useToast();
	const [busyId, setBusyId] = useState<string | null>(null);
	const { data, isLoading, mutate } = useSWR<FlaggedReview[]>(
		"/admin/reviews/flagged",
	);

	async function unflag(id: string) {
		setBusyId(id);
		try {
			await api.patch(`/admin/reviews/${id}/unflag`);
			toast("Review unflagged", "success");
			await mutate();
		} catch (err: any) {
			toast(err.response?.data?.message ?? "Could not unflag", "error");
		} finally {
			setBusyId(null);
		}
	}

	async function remove(id: string) {
		setBusyId(id);
		try {
			await api.delete(`/admin/reviews/${id}`);
			toast("Review deleted", "success");
			await mutate();
		} catch (err: any) {
			toast(err.response?.data?.message ?? "Could not delete", "error");
		} finally {
			setBusyId(null);
		}
	}

	const reviews = data ?? [];

	return (
		<Stack $gap={20}>
			<PageHeader
				eyebrow="Admin console"
				title="Flagged reviews"
				subtitle="Moderate reviews that buyers or vendors have flagged."
			/>

			{isLoading ? (
				<LoadingGrid />
			) : reviews.length === 0 ? (
				<FadeIn>
					<EmptyState
						icon="✨"
						title="All clear"
						description="No flagged reviews right now. The moderation queue is empty."
					/>
				</FadeIn>
			) : (
				<>
					<FadeIn>
						<Grid $min={200} $gap={16}>
							<StatCard
								label="Flagged reviews"
								value={reviews.length}
								icon="🚩"
								tone="var(--pc-color-danger)"
								hint="Awaiting moderation"
							/>
						</Grid>
					</FadeIn>

					<Grid $min={300} $gap={16}>
						{reviews.map((r, i) => (
							<FadeIn key={r.id} $delay={i * 45}>
								<ReviewCard>
									<Row
										$justify="space-between"
										$align="center"
									>
										<Stars>
											<span className="filled">
												{"★".repeat(r.rating)}
											</span>
											<span className="empty">
												{"★".repeat(5 - r.rating)}
											</span>
											<Text as="span" $muted $size={13}>
												{r.rating}/5
											</Text>
										</Stars>
										<Badge $tone="danger">Flagged</Badge>
									</Row>
									{r.comment ? (
										<Quote>“{r.comment}”</Quote>
									) : (
										<NoComment $muted $size={14}>
											No written comment.
										</NoComment>
									)}
									{r.tags.length > 0 && (
										<TagRow $gap={6}>
											{r.tags.map((t) => (
												<Badge key={t} $tone="muted">
													{t}
												</Badge>
											))}
										</TagRow>
									)}
									<Text $muted $size={12}>
										{formatDate(r.createdAt)}
									</Text>
									<Divider />
									<Row $gap={10}>
										<Button
											$variant="secondary"
											$size="sm"
											$loading={busyId === r.id}
											onClick={() => unflag(r.id)}
										>
											Unflag
										</Button>
										<Button
											$variant="danger"
											$size="sm"
											$loading={busyId === r.id}
											onClick={() => remove(r.id)}
										>
											Delete
										</Button>
									</Row>
								</ReviewCard>
							</FadeIn>
						))}
					</Grid>
				</>
			)}
		</Stack>
	);
}
