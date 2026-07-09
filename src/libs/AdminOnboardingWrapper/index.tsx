"use client";

import { useState } from "react";
import styled from "styled-components";
import useSWR from "swr";
import {
	Badge,
	Button,
	Card,
	EmptyState,
	PageHeader,
	Skeleton,
	Stack,
	Text,
	Textarea,
} from "@/components";
import { api, apiData } from "@/constants/api";
import { fetcher } from "@/constants/fetcher";
import { formatDateTime } from "@/constants/formatters";
import { useToast } from "@/hooks/useToast";

interface QueueVendor {
	id: string;
	businessName?: string;
	email: string;
	vendorType?: string;
	description?: string;
	categories: string[];
	state?: string;
	areaOrAddress?: string;
	profileImageUrl?: string;
	profileCompleteness: number;
	submittedAt?: string;
	bankName?: string;
	accountName?: string;
}

interface Submission {
	vendor: QueueVendor & { status: string };
	owner: {
		firstName: string;
		lastName: string;
		isPhoneVerified: boolean;
		createdAt: string;
	} | null;
}

const Layout = styled.div`
	display: grid;
	grid-template-columns: 340px 1fr;
	gap: var(--pc-space-5);
	@media (max-width: 900px) {
		grid-template-columns: 1fr;
	}
`;
const List = styled(Stack)`
	gap: 10px;
`;
const Item = styled.button<{ $active: boolean }>`
	text-align: left;
	width: 100%;
	border: 1px solid
		${(p) => (p.$active ? "var(--pc-color-primary)" : "var(--pc-border)")};
	background: ${(p) =>
		p.$active ? "var(--pc-color-primary-50)" : "var(--pc-surface)"};
	border-radius: var(--pc-radius);
	padding: 13px 15px;
	cursor: pointer;
	display: flex;
	flex-direction: column;
	gap: 4px;
`;
const Field = styled.div`
	display: flex;
	justify-content: space-between;
	gap: 12px;
	padding: 9px 0;
	border-bottom: 1px solid var(--pc-border);
	font-size: 14px;
	& > span:first-child {
		color: var(--pc-text-muted);
	}
	& > span:last-child {
		font-weight: 600;
		text-align: right;
	}
`;

export default function AdminOnboardingWrapper() {
	const { toast } = useToast();
	const { data, isLoading, mutate } = useSWR<QueueVendor[]>(
		"/admin/onboarding",
		fetcher,
	);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [reason, setReason] = useState("");
	const [busy, setBusy] = useState(false);

	const { data: submission, mutate: mutateDetail } = useSWR<Submission>(
		selectedId ? `/admin/onboarding/${selectedId}` : null,
		fetcher,
	);

	const queue = data ?? [];

	async function act(kind: "approve" | "reject") {
		if (!selectedId) return;
		if (kind === "reject" && reason.trim().length === 0) {
			toast(
				"Please provide a reason for the changes requested.",
				"error",
			);
			return;
		}
		setBusy(true);
		try {
			await apiData(
				api.post(
					`/admin/onboarding/${selectedId}/${kind}`,
					kind === "reject" ? { reason } : {},
				),
			);
			toast(
				kind === "approve" ? "Vendor approved." : "Changes requested.",
				"success",
			);
			setSelectedId(null);
			setReason("");
			await mutate();
			await mutateDetail();
		} catch {
			toast("Action failed. Please try again.", "error");
		} finally {
			setBusy(false);
		}
	}

	return (
		<Stack $gap={20}>
			<PageHeader
				eyebrow="Vendor onboarding"
				title="Review queue"
				subtitle="Approve or request changes on new vendor applications before they go live."
			/>

			{isLoading ? (
				<Skeleton style={{ height: 120 }} />
			) : queue.length === 0 ? (
				<EmptyState
					icon="📥"
					title="No pending applications"
					description="New vendor submissions will appear here for review."
				/>
			) : (
				<Layout>
					<List>
						{queue.map((v) => (
							<Item
								key={v.id}
								$active={v.id === selectedId}
								onClick={() => setSelectedId(v.id)}
							>
								<Text $weight={700}>
									{v.businessName ?? "Unnamed vendor"}
								</Text>
								<Text $muted $size={13}>
									{v.email}
								</Text>
								<Text $muted $size={12}>
									{v.submittedAt
										? `Submitted ${formatDateTime(v.submittedAt)}`
										: "Submitted"}
								</Text>
							</Item>
						))}
					</List>

					<Card>
						{!submission ? (
							<Text $muted>
								Select an application to review its details.
							</Text>
						) : (
							<Stack $gap={14}>
								<div>
									<Text $size={20} $weight={800}>
										{submission.vendor.businessName ??
											"Unnamed vendor"}
									</Text>{" "}
									<Badge $tone="warning">
										Pending review
									</Badge>
								</div>
								<div>
									<Field>
										<span>Email</span>
										<span>{submission.vendor.email}</span>
									</Field>
									<Field>
										<span>Owner</span>
										<span>
											{submission.owner
												? `${submission.owner.firstName} ${submission.owner.lastName}`
												: "—"}
										</span>
									</Field>
									<Field>
										<span>Phone verified</span>
										<span>
											{submission.owner?.isPhoneVerified
												? "Yes"
												: "No"}
										</span>
									</Field>
									<Field>
										<span>Vendor type</span>
										<span>
											{submission.vendor.vendorType ??
												"—"}
										</span>
									</Field>
									<Field>
										<span>Categories</span>
										<span>
											{submission.vendor.categories?.join(
												", ",
											) || "—"}
										</span>
									</Field>
									<Field>
										<span>Location</span>
										<span>
											{[
												submission.vendor.areaOrAddress,
												submission.vendor.state,
											]
												.filter(Boolean)
												.join(", ") || "—"}
										</span>
									</Field>
									<Field>
										<span>Bank</span>
										<span>
											{submission.vendor.bankName
												? `${submission.vendor.bankName} · ${submission.vendor.accountName ?? ""}`
												: "—"}
										</span>
									</Field>
									<Field>
										<span>Completeness</span>
										<span>
											{
												submission.vendor
													.profileCompleteness
											}
											%
										</span>
									</Field>
								</div>
								{submission.vendor.description && (
									<Text $muted $size={14}>
										{submission.vendor.description}
									</Text>
								)}
								<Textarea
									placeholder="Reason (required to request changes)"
									value={reason}
									onChange={(e) => setReason(e.target.value)}
									rows={3}
								/>
								<div style={{ display: "flex", gap: 10 }}>
									<Button
										onClick={() => act("approve")}
										disabled={busy}
									>
										Approve & go live
									</Button>
									<Button
										$variant="ghost"
										onClick={() => act("reject")}
										disabled={busy}
									>
										Request changes
									</Button>
								</div>
							</Stack>
						)}
					</Card>
				</Layout>
			)}
		</Stack>
	);
}
