"use client";

import styled from "styled-components";
import useSWR from "swr";
import {
	Avatar,
	Badge,
	Card,
	EmptyState,
	FadeIn,
	Grid,
	PageHeader,
	Row,
	SectionHeader,
	Skeleton,
	Stack,
	StatCard,
	Text,
} from "@/components";
import { formatDateTime, statusLabel } from "@/constants/formatters";

interface TopVendor {
	id: string;
	businessName: string | null;
	rating: number;
	totalOrders: number;
	totalReviews: number;
}
interface Analytics {
	totalVendors: number;
	activeVendors: number;
	totalPaidOrders: number;
	topVendors: TopVendor[];
}
interface AuditEntry {
	id: string;
	action: string;
	resourceType: string;
	resourceId?: string;
	role?: string;
	createdAt: string;
}

const Scroll = styled.div`
	overflow-x: auto;
	border-radius: var(--pc-radius);
`;
const Table = styled.table`
	width: 100%;
	border-collapse: collapse;
	font-size: 14px;
	th,
	td {
		text-align: left;
		padding: 13px 16px;
		white-space: nowrap;
	}
	thead th {
		color: var(--pc-text-muted);
		font-weight: 700;
		font-size: 11.5px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		background: var(--pc-surface-2);
		border-bottom: 1px solid var(--pc-border);
	}
	tbody td {
		border-bottom: 1px solid var(--pc-border);
		color: var(--pc-text);
	}
	tbody tr:last-child td {
		border-bottom: none;
	}
	tbody tr {
		transition: background var(--pc-dur) var(--pc-ease);
	}
	tbody tr:hover td {
		background: var(--pc-surface-2);
	}
`;
const Rank = styled.span`
	display: inline-grid;
	place-items: center;
	width: 24px;
	height: 24px;
	border-radius: var(--pc-radius-pill);
	background: var(--pc-color-primary-50);
	color: var(--pc-color-primary-600);
	font-family: var(--pc-font-display);
	font-weight: 800;
	font-size: 12px;
`;
const Rating = styled.span`
	display: inline-flex;
	align-items: center;
	gap: 4px;
	font-weight: 700;
	color: var(--pc-text);
	& > span {
		color: var(--pc-color-gold);
	}
`;
const EmptyCell = styled.td`
	padding: 0 !important;
`;
const EmptyPad = styled.div`
	padding: var(--pc-space-6) var(--pc-space-4);
`;

function LoadingState() {
	return (
		<Stack $gap={20}>
			<PageHeader
				eyebrow="Admin console"
				title="Overview"
				subtitle="Platform health at a glance."
			/>
			<Grid $min={210} $gap={16}>
				{[0, 1, 2].map((i) => (
					<Card key={i}>
						<Stack $gap={12}>
							<Skeleton $w="55%" $h={13} />
							<Skeleton $w="45%" $h={30} />
						</Stack>
					</Card>
				))}
			</Grid>
			<Card>
				<Stack $gap={14}>
					<Skeleton $w="160px" $h={18} />
					{[0, 1, 2, 3].map((i) => (
						<Skeleton key={i} $h={16} />
					))}
				</Stack>
			</Card>
		</Stack>
	);
}

export default function AdminOverviewWrapper() {
	const { data, isLoading } = useSWR<Analytics>("/admin/analytics");
	const { data: audit } = useSWR<AuditEntry[]>("/admin/audit?limit=15");

	if (isLoading || !data) return <LoadingState />;

	const tiles = [
		{
			label: "Total vendors",
			value: data.totalVendors,
			icon: "🏪",
			tone: "var(--pc-gradient-warm)",
		},
		{
			label: "Active vendors",
			value: data.activeVendors,
			icon: "🔥",
			tone: "var(--pc-color-accent)",
		},
		{
			label: "Paid orders",
			value: data.totalPaidOrders,
			icon: "🧾",
			tone: "var(--pc-color-primary)",
		},
	];

	return (
		<Stack $gap={20}>
			<PageHeader
				eyebrow="Admin console"
				title="Overview"
				subtitle="Platform health at a glance."
			/>

			<FadeIn>
				<Grid $min={210} $gap={16}>
					{tiles.map((t) => (
						<StatCard
							key={t.label}
							label={t.label}
							value={t.value.toLocaleString("en-NG")}
							icon={t.icon}
							tone={t.tone}
						/>
					))}
				</Grid>
			</FadeIn>

			<FadeIn $delay={60}>
				<Stack $gap={14}>
					<SectionHeader title="Top vendors" icon="🏆" />
					<Card $pad={0}>
						<Scroll>
							<Table>
								<thead>
									<tr>
										<th>Business</th>
										<th>Rating</th>
										<th>Orders</th>
										<th>Reviews</th>
									</tr>
								</thead>
								<tbody>
									{data.topVendors.length === 0 ? (
										<tr>
											<EmptyCell colSpan={4}>
												<EmptyPad>
													<EmptyState
														icon="🏪"
														title="No vendors yet"
														description="Top-performing vendors will appear here once orders roll in."
													/>
												</EmptyPad>
											</EmptyCell>
										</tr>
									) : (
										data.topVendors.map((v, i) => (
											<tr key={v.id}>
												<td>
													<Row
														$gap={10}
														$align="center"
													>
														<Rank>{i + 1}</Rank>
														<Avatar
															name={
																v.businessName ??
																"?"
															}
															size={30}
														/>
														<Text $weight={700}>
															{v.businessName ??
																"—"}
														</Text>
													</Row>
												</td>
												<td>
													<Rating>
														{v.rating.toFixed(1)}
														<span aria-hidden>
															★
														</span>
													</Rating>
												</td>
												<td>{v.totalOrders}</td>
												<td>{v.totalReviews}</td>
											</tr>
										))
									)}
								</tbody>
							</Table>
						</Scroll>
					</Card>
				</Stack>
			</FadeIn>

			<FadeIn $delay={120}>
				<Stack $gap={14}>
					<SectionHeader title="Recent activity" icon="📋" />
					<Card $pad={0}>
						<Scroll>
							<Table>
								<thead>
									<tr>
										<th>Action</th>
										<th>Resource</th>
										<th>Role</th>
										<th>When</th>
									</tr>
								</thead>
								<tbody>
									{!audit || audit.length === 0 ? (
										<tr>
											<EmptyCell colSpan={4}>
												<EmptyPad>
													<EmptyState
														icon="📭"
														title="No recent activity"
														description="Admin and system actions across the platform will show up here."
													/>
												</EmptyPad>
											</EmptyCell>
										</tr>
									) : (
										audit.map((a) => (
											<tr key={a.id}>
												<td>
													<Badge $tone="muted">
														{statusLabel(a.action)}
													</Badge>
												</td>
												<td>{a.resourceType}</td>
												<td>{a.role ?? "—"}</td>
												<td>
													<Text $muted $size={13}>
														{formatDateTime(
															a.createdAt,
														)}
													</Text>
												</td>
											</tr>
										))
									)}
								</tbody>
							</Table>
						</Scroll>
					</Card>
				</Stack>
			</FadeIn>
		</Stack>
	);
}
