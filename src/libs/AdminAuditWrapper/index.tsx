"use client";

import { useState } from "react";
import styled from "styled-components";
import useSWR from "swr";
import { Card, Input, PageHeader, Skeleton, Stack, Text } from "@/components";
import { fetcher } from "@/constants/fetcher";
import { formatDateTime } from "@/constants/formatters";

interface AuditLog {
	id?: string;
	_id?: string;
	userId?: string;
	role?: string;
	action: string;
	resourceType: string;
	resourceId?: string;
	createdAt: string;
}

const Scroll = styled.div`
	overflow-x: auto;
	border-radius: var(--pc-radius);
`;
const Table = styled.table`
	width: 100%;
	border-collapse: collapse;
	font-size: 13.5px;
	th,
	td {
		text-align: left;
		padding: 11px 14px;
		white-space: nowrap;
		border-bottom: 1px solid var(--pc-border);
	}
	thead th {
		color: var(--pc-text-muted);
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		background: var(--pc-surface-2);
	}
`;

export default function AdminAuditWrapper() {
	const { data, isLoading } = useSWR<AuditLog[]>(
		"/admin/audit?limit=100",
		fetcher,
	);
	const [q, setQ] = useState("");

	const logs = (data ?? []).filter((l) =>
		q
			? `${l.action} ${l.resourceType} ${l.resourceId ?? ""} ${l.role ?? ""}`
					.toLowerCase()
					.includes(q.toLowerCase())
			: true,
	);

	return (
		<Stack $gap={20}>
			<PageHeader
				eyebrow="Security"
				title="Audit log"
				subtitle="Every privileged action — IAM changes, approvals, suspensions and more."
			/>
			<Input
				placeholder="Filter by action, resource or actor…"
				value={q}
				onChange={(e) => setQ(e.target.value)}
			/>
			{isLoading ? (
				<Skeleton style={{ height: 200 }} />
			) : (
				<Card style={{ padding: 0 }}>
					<Scroll>
						<Table>
							<thead>
								<tr>
									<th>When</th>
									<th>Action</th>
									<th>Resource</th>
									<th>Actor</th>
									<th>Role</th>
								</tr>
							</thead>
							<tbody>
								{logs.length === 0 ? (
									<tr>
										<td colSpan={5}>
											<Text $muted>
												No audit entries.
											</Text>
										</td>
									</tr>
								) : (
									logs.map((l) => (
										<tr key={l.id ?? l._id}>
											<td>
												{formatDateTime(l.createdAt)}
											</td>
											<td>
												<Text $weight={600} $size={13}>
													{l.action}
												</Text>
											</td>
											<td>
												{l.resourceType}
												{l.resourceId
													? ` · ${l.resourceId.slice(-6)}`
													: ""}
											</td>
											<td>
												{l.userId?.slice(-6) ?? "—"}
											</td>
											<td>{l.role ?? "—"}</td>
										</tr>
									))
								)}
							</tbody>
						</Table>
					</Scroll>
				</Card>
			)}
		</Stack>
	);
}
