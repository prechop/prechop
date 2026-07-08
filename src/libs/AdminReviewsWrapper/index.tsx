"use client";

import { useState } from "react";
import styled from "styled-components";
import useSWR from "swr";
import {
	Badge,
	Button,
	Card,
	Grid,
	Heading,
	PageLoader,
	Row,
	Stack,
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
	gap: 10px;
`;
const Stars = styled.span`
	color: var(--pc-color-primary);
	font-weight: 700;
`;
const TagRow = styled(Row)`
	flex-wrap: wrap;
`;

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
		<Stack $gap={4}>
			<Heading $size={26}>Flagged reviews</Heading>
			<Text $muted>
				Moderate reviews that buyers or vendors have flagged.
			</Text>

			{isLoading ? (
				<PageLoader />
			) : reviews.length === 0 ? (
				<Card style={{ marginTop: "var(--pc-space-5)" }}>
					<Text $muted style={{ textAlign: "center" }}>
						No flagged reviews. All clear.
					</Text>
				</Card>
			) : (
				<Grid
					$min={300}
					$gap={16}
					style={{ marginTop: "var(--pc-space-5)" }}
				>
					{reviews.map((r) => (
						<ReviewCard key={r.id}>
							<Row $justify="space-between">
								<Stars>
									{"★".repeat(r.rating)}
									<Text
										as="span"
										$muted
										$size={13}
										style={{ marginLeft: 6 }}
									>
										{r.rating}/5
									</Text>
								</Stars>
								<Badge $tone="danger">Flagged</Badge>
							</Row>
							<Text $size={14}>
								{r.comment
									? `“${r.comment}”`
									: "No written comment."}
							</Text>
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
					))}
				</Grid>
			)}
		</Stack>
	);
}
