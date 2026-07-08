"use client";

import styled from "styled-components";
import useSWR from "swr";
import {
	Badge,
	Card,
	Grid,
	Heading,
	PageLoader,
	Stack,
	Text,
	Title,
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

const Tile = styled(Card)`
	display: flex;
	flex-direction: column;
	gap: 6px;
`;
const Stat = styled.span`
	font-size: 30px;
	font-weight: 800;
	color: var(--pc-text);
	letter-spacing: -0.02em;
`;
const Section = styled(Stack)`
	margin-top: var(--pc-space-6);
`;
const Scroll = styled.div`
	overflow-x: auto;
`;
const Table = styled.table`
	width: 100%;
	border-collapse: collapse;
	font-size: 14px;
	th, td {
		text-align: left;
		padding: 10px 12px;
		border-bottom: 1px solid var(--pc-border);
		white-space: nowrap;
	}
	th {
		color: var(--pc-text-muted);
		font-weight: 600;
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}
`;
const Empty = styled(Text)`
	padding: var(--pc-space-5);
	text-align: center;
`;

export default function AdminOverviewWrapper() {
	const { data, isLoading } = useSWR<Analytics>("/admin/analytics");
	const { data: audit } = useSWR<AuditEntry[]>("/admin/audit?limit=15");

	if (isLoading || !data) return <PageLoader />;

	const tiles = [
		{ label: "Total vendors", value: data.totalVendors },
		{ label: "Active vendors", value: data.activeVendors },
		{ label: "Paid orders", value: data.totalPaidOrders },
	];

	return (
		<Stack $gap={4}>
			<Heading $size={26}>Overview</Heading>
			<Text $muted>Platform health at a glance.</Text>

			<Grid
				$min={200}
				$gap={16}
				style={{ marginTop: "var(--pc-space-5)" }}
			>
				{tiles.map((t) => (
					<Tile key={t.label}>
						<Text $muted $size={13} $weight={600}>
							{t.label}
						</Text>
						<Stat>{t.value.toLocaleString("en-NG")}</Stat>
					</Tile>
				))}
			</Grid>

			<Section $gap={12}>
				<Title $size={18}>Top vendors</Title>
				<Card style={{ padding: 0 }}>
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
										<td colSpan={4}>
											<Empty $muted>
												No vendors yet.
											</Empty>
										</td>
									</tr>
								) : (
									data.topVendors.map((v) => (
										<tr key={v.id}>
											<td>{v.businessName ?? "—"}</td>
											<td>{v.rating.toFixed(1)} ★</td>
											<td>{v.totalOrders}</td>
											<td>{v.totalReviews}</td>
										</tr>
									))
								)}
							</tbody>
						</Table>
					</Scroll>
				</Card>
			</Section>

			<Section $gap={12}>
				<Title $size={18}>Recent activity</Title>
				<Card style={{ padding: 0 }}>
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
										<td colSpan={4}>
											<Empty $muted>
												No recent activity.
											</Empty>
										</td>
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
												{formatDateTime(a.createdAt)}
											</td>
										</tr>
									))
								)}
							</tbody>
						</Table>
					</Scroll>
				</Card>
			</Section>
		</Stack>
	);
}
