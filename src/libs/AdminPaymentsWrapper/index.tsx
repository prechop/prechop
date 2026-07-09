"use client";

import { useState } from "react";
import styled from "styled-components";
import useSWR from "swr";
import {
	Badge,
	Card,
	PageHeader,
	Select,
	Skeleton,
	Stack,
	Text,
} from "@/components";
import { fetcher } from "@/constants/fetcher";
import { formatDateTime, formatKobo } from "@/constants/formatters";

interface Payment {
	id?: string;
	_id?: string;
	amountKobo: number;
	status: string;
	paystackRef?: string;
	buyerId?: string;
	vendorId?: string;
	createdAt: string;
}
interface PaymentsResult {
	payments: Payment[];
	total: number;
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

const tone = (s: string) =>
	s === "SUCCESS"
		? "success"
		: s === "REFUNDED"
			? "gold"
			: s === "FAILED"
				? "danger"
				: "muted";

export default function AdminPaymentsWrapper() {
	const [status, setStatus] = useState("");
	const { data, isLoading } = useSWR<PaymentsResult>(
		`/admin/payments${status ? `?status=${status}` : ""}`,
		fetcher,
	);
	const payments = data?.payments ?? [];

	return (
		<Stack $gap={20}>
			<PageHeader
				eyebrow="Finance"
				title="Payments"
				subtitle={`All payment transactions${data ? ` · ${data.total} total` : ""}.`}
			/>
			<Select
				value={status}
				onChange={(e) => setStatus(e.target.value)}
				style={{ maxWidth: 240 }}
			>
				<option value="">All statuses</option>
				<option value="SUCCESS">Success</option>
				<option value="INITIALIZED">Initialized</option>
				<option value="FAILED">Failed</option>
				<option value="ABANDONED">Abandoned</option>
				<option value="REFUNDED">Refunded</option>
			</Select>
			{isLoading ? (
				<Skeleton style={{ height: 200 }} />
			) : (
				<Card style={{ padding: 0 }}>
					<Scroll>
						<Table>
							<thead>
								<tr>
									<th>When</th>
									<th>Reference</th>
									<th>Amount</th>
									<th>Status</th>
								</tr>
							</thead>
							<tbody>
								{payments.length === 0 ? (
									<tr>
										<td colSpan={4}>
											<Text $muted>
												No payments found.
											</Text>
										</td>
									</tr>
								) : (
									payments.map((p) => (
										<tr key={p.id ?? p._id}>
											<td>
												{formatDateTime(p.createdAt)}
											</td>
											<td>{p.paystackRef ?? "—"}</td>
											<td>{formatKobo(p.amountKobo)}</td>
											<td>
												<Badge $tone={tone(p.status)}>
													{p.status}
												</Badge>
											</td>
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
