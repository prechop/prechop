"use client";

import { useState } from "react";
import styled from "styled-components";
import useSWR, { mutate as globalMutate } from "swr";
import {
	Badge,
	Button,
	Card,
	Heading,
	PageLoader,
	Row,
	Select,
	Stack,
	Text,
	Textarea,
	Title,
} from "@/components";
import { api } from "@/constants/api";
import { statusLabel } from "@/constants/formatters";
import { useToast } from "@/hooks/useToast";

type VendorStatus = "INCOMPLETE" | "ACTIVE" | "SUSPENDED";

interface AdminVendor {
	id: string;
	businessName?: string;
	email: string;
	status: VendorStatus;
	rating: number;
	totalOrders: number;
	totalReviews: number;
	vendorType?: string;
	description?: string;
	categories: string[];
	profileCompleteness: number;
	isOpenForOrders: boolean;
	campusId: string;
}

const tone = (s: VendorStatus) =>
	s === "ACTIVE" ? "success" : s === "SUSPENDED" ? "danger" : "muted";

const Toolbar = styled(Row)`
	margin: var(--pc-space-5) 0 var(--pc-space-4);
	flex-wrap: wrap;
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
		padding: 11px 12px;
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
const Overlay = styled.div`
	position: fixed;
	inset: 0;
	background: rgba(0, 0, 0, 0.45);
	display: flex;
	align-items: center;
	justify-content: center;
	padding: var(--pc-space-4);
	z-index: 80;
`;
const Modal = styled(Card)`
	width: min(520px, 100%);
	max-height: 90dvh;
	overflow-y: auto;
`;
const KV = styled(Row)`
	justify-content: space-between;
	border-bottom: 1px solid var(--pc-border);
	padding: 8px 0;
`;

export default function AdminVendorsWrapper() {
	const { toast } = useToast();
	const [status, setStatus] = useState<string>("");
	const [detailId, setDetailId] = useState<string | null>(null);
	const [suspendId, setSuspendId] = useState<string | null>(null);
	const [reason, setReason] = useState("");
	const [busy, setBusy] = useState(false);

	const key = `/admin/vendors${status ? `?status=${status}` : ""}`;
	const { data, isLoading, mutate } = useSWR<AdminVendor[]>(key);
	const { data: detail } = useSWR<AdminVendor>(
		detailId ? `/admin/vendors/${detailId}` : null,
	);

	async function reactivate(id: string) {
		setBusy(true);
		try {
			await api.post(`/admin/vendors/${id}/reactivate`);
			toast("Vendor reactivated", "success");
			await mutate();
		} catch (err: any) {
			toast(
				err.response?.data?.message ?? "Could not reactivate",
				"error",
			);
		} finally {
			setBusy(false);
		}
	}

	async function confirmSuspend() {
		if (!suspendId || !reason.trim()) return;
		setBusy(true);
		try {
			await api.post(`/admin/vendors/${suspendId}/suspend`, {
				reason: reason.trim(),
			});
			toast("Vendor suspended", "success");
			setSuspendId(null);
			setReason("");
			await mutate();
			if (detailId) await globalMutate(`/admin/vendors/${detailId}`);
		} catch (err: any) {
			toast(err.response?.data?.message ?? "Could not suspend", "error");
		} finally {
			setBusy(false);
		}
	}

	const vendors = data ?? [];

	return (
		<Stack $gap={4}>
			<Heading $size={26}>Vendors</Heading>
			<Text $muted>Manage vendor accounts across all campuses.</Text>

			<Toolbar $gap={12}>
				<div style={{ minWidth: 200 }}>
					<Select
						label="Filter by status"
						value={status}
						onChange={(e) => setStatus(e.target.value)}
					>
						<option value="">All statuses</option>
						<option value="ACTIVE">Active</option>
						<option value="SUSPENDED">Suspended</option>
						<option value="INCOMPLETE">Incomplete</option>
					</Select>
				</div>
			</Toolbar>

			{isLoading ? (
				<PageLoader />
			) : vendors.length === 0 ? (
				<Card>
					<Text $muted style={{ textAlign: "center" }}>
						No vendors found.
					</Text>
				</Card>
			) : (
				<Card style={{ padding: 0 }}>
					<Scroll>
						<Table>
							<thead>
								<tr>
									<th>Business</th>
									<th>Email</th>
									<th>Status</th>
									<th>Rating</th>
									<th>Orders</th>
									<th>Actions</th>
								</tr>
							</thead>
							<tbody>
								{vendors.map((v) => (
									<tr key={v.id}>
										<td>{v.businessName ?? "—"}</td>
										<td>{v.email}</td>
										<td>
											<Badge $tone={tone(v.status)}>
												{statusLabel(v.status)}
											</Badge>
										</td>
										<td>{v.rating.toFixed(1)} ★</td>
										<td>{v.totalOrders}</td>
										<td>
											<Row $gap={8}>
												<Button
													$variant="ghost"
													$size="sm"
													onClick={() =>
														setDetailId(v.id)
													}
												>
													View
												</Button>
												{v.status === "SUSPENDED" ? (
													<Button
														$variant="secondary"
														$size="sm"
														$loading={busy}
														onClick={() =>
															reactivate(v.id)
														}
													>
														Reactivate
													</Button>
												) : (
													<Button
														$variant="danger"
														$size="sm"
														onClick={() =>
															setSuspendId(v.id)
														}
													>
														Suspend
													</Button>
												)}
											</Row>
										</td>
									</tr>
								))}
							</tbody>
						</Table>
					</Scroll>
				</Card>
			)}

			{detailId && (
				<Overlay onClick={() => setDetailId(null)}>
					<Modal onClick={(e) => e.stopPropagation()}>
						<Stack $gap={12}>
							<Row $justify="space-between">
								<Title $size={18}>Vendor detail</Title>
								<Button
									$variant="ghost"
									$size="sm"
									onClick={() => setDetailId(null)}
								>
									Close
								</Button>
							</Row>
							{!detail ? (
								<PageLoader />
							) : (
								<Stack $gap={0}>
									<KV>
										<Text $muted>Business</Text>
										<Text $weight={600}>
											{detail.businessName ?? "—"}
										</Text>
									</KV>
									<KV>
										<Text $muted>Email</Text>
										<Text $weight={600}>
											{detail.email}
										</Text>
									</KV>
									<KV>
										<Text $muted>Status</Text>
										<Badge $tone={tone(detail.status)}>
											{statusLabel(detail.status)}
										</Badge>
									</KV>
									<KV>
										<Text $muted>Type</Text>
										<Text $weight={600}>
											{detail.vendorType
												? statusLabel(detail.vendorType)
												: "—"}
										</Text>
									</KV>
									<KV>
										<Text $muted>Rating</Text>
										<Text $weight={600}>
											{detail.rating.toFixed(1)} ★ (
											{detail.totalReviews})
										</Text>
									</KV>
									<KV>
										<Text $muted>Total orders</Text>
										<Text $weight={600}>
											{detail.totalOrders}
										</Text>
									</KV>
									<KV>
										<Text $muted>Profile completeness</Text>
										<Text $weight={600}>
											{detail.profileCompleteness}%
										</Text>
									</KV>
									<KV>
										<Text $muted>Open for orders</Text>
										<Text $weight={600}>
											{detail.isOpenForOrders
												? "Yes"
												: "No"}
										</Text>
									</KV>
									{detail.categories.length > 0 && (
										<KV>
											<Text $muted>Categories</Text>
											<Text $weight={600}>
												{detail.categories
													.map((c) => statusLabel(c))
													.join(", ")}
											</Text>
										</KV>
									)}
								</Stack>
							)}
						</Stack>
					</Modal>
				</Overlay>
			)}

			{suspendId && (
				<Overlay
					onClick={() => {
						setSuspendId(null);
						setReason("");
					}}
				>
					<Modal onClick={(e) => e.stopPropagation()}>
						<Stack $gap={14}>
							<Title $size={18}>Suspend vendor</Title>
							<Text $muted>
								Provide a reason. The vendor is emailed this
								note.
							</Text>
							<Textarea
								label="Reason"
								value={reason}
								onChange={(e) => setReason(e.target.value)}
								placeholder="e.g. Repeated failure to fulfil orders"
							/>
							<Row $gap={10} $justify="flex-end">
								<Button
									$variant="secondary"
									onClick={() => {
										setSuspendId(null);
										setReason("");
									}}
								>
									Cancel
								</Button>
								<Button
									$variant="danger"
									$loading={busy}
									disabled={!reason.trim()}
									onClick={confirmSuspend}
								>
									Suspend
								</Button>
							</Row>
						</Stack>
					</Modal>
				</Overlay>
			)}
		</Stack>
	);
}
