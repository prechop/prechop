"use client";

import { useEffect, useState } from "react";
import styled from "styled-components";
import useSWR, { mutate as globalMutate } from "swr";
import {
	Avatar,
	Badge,
	Button,
	Card,
	EmptyState,
	FadeIn,
	Grid,
	PageHeader,
	Row,
	Select,
	Skeleton,
	Stack,
	StatCard,
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

const Toolbar = styled(Card)`
	display: flex;
	flex-wrap: wrap;
	align-items: flex-end;
	gap: var(--pc-space-4);
`;
const FilterField = styled.div`
	min-width: 200px;
	flex: 1 1 220px;
	max-width: 320px;
`;
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
const Rating = styled.span`
	display: inline-flex;
	align-items: center;
	gap: 4px;
	font-weight: 700;
	& > span {
		color: var(--pc-color-gold);
	}
`;
const Overlay = styled.div`
	position: fixed;
	inset: 0;
	background: rgba(0, 0, 0, 0.5);
	backdrop-filter: blur(3px);
	display: flex;
	align-items: center;
	justify-content: center;
	padding: var(--pc-space-4);
	z-index: 80;
	animation: pc-fade-up var(--pc-dur) var(--pc-ease) both;
`;
const Modal = styled(Card)`
	width: min(520px, 100%);
	max-height: 90dvh;
	overflow-y: auto;
	box-shadow: var(--pc-shadow-lg);
`;
const KV = styled(Row)`
	justify-content: space-between;
	gap: var(--pc-space-4);
	border-bottom: 1px solid var(--pc-border);
	padding: 11px 0;
	&:last-child {
		border-bottom: none;
	}
`;

function LoadingTable() {
	return (
		<Card $pad={0}>
			<Stack $gap={0}>
				{[0, 1, 2, 3, 4].map((i) => (
					<Row
						key={i}
						$justify="space-between"
						$align="center"
						style={{
							padding: "16px",
							borderBottom: "1px solid var(--pc-border)",
						}}
					>
						<Row $gap={10} $align="center">
							<Skeleton $w="32px" $h={32} $radius="50%" />
							<Skeleton $w="140px" $h={14} />
						</Row>
						<Skeleton $w="80px" $h={22} $radius="999px" />
					</Row>
				))}
			</Stack>
		</Card>
	);
}

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

	useEffect(() => {
		const id =
			typeof window !== "undefined"
				? new URLSearchParams(window.location.search).get("detail")
				: null;
		if (id) setDetailId(id);
	}, []);

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
	const activeCount = vendors.filter((v) => v.status === "ACTIVE").length;
	const suspendedCount = vendors.filter(
		(v) => v.status === "SUSPENDED",
	).length;

	return (
		<Stack $gap={20}>
			<PageHeader
				eyebrow="Admin console"
				title="Vendors"
				subtitle="Manage vendor accounts across all campuses."
			/>

			<FadeIn>
				<Grid $min={200} $gap={16}>
					<StatCard
						label="Vendors shown"
						value={vendors.length}
						icon="🏪"
						tone="var(--pc-gradient-warm)"
					/>
					<StatCard
						label="Active"
						value={activeCount}
						icon="🔥"
						tone="var(--pc-color-accent)"
					/>
					<StatCard
						label="Suspended"
						value={suspendedCount}
						icon="⛔"
						tone="var(--pc-color-danger)"
					/>
				</Grid>
			</FadeIn>

			<Toolbar>
				<FilterField>
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
				</FilterField>
			</Toolbar>

			{isLoading ? (
				<LoadingTable />
			) : vendors.length === 0 ? (
				<FadeIn>
					<EmptyState
						icon="🏪"
						title="No vendors found"
						description="No vendor accounts match this filter yet. Try a different status."
					/>
				</FadeIn>
			) : (
				<FadeIn>
					<Card $pad={0}>
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
											<td>
												<Row $gap={10} $align="center">
													<Avatar
														name={
															v.businessName ??
															"?"
														}
														size={32}
													/>
													<Text $weight={700}>
														{v.businessName ?? "—"}
													</Text>
												</Row>
											</td>
											<td>
												<Text $muted $size={13}>
													{v.email}
												</Text>
											</td>
											<td>
												<Badge $tone={tone(v.status)}>
													{statusLabel(v.status)}
												</Badge>
											</td>
											<td>
												<Rating>
													{v.rating.toFixed(1)}
													<span aria-hidden>★</span>
												</Rating>
											</td>
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
													{v.status ===
													"SUSPENDED" ? (
														<Button
															$variant="accent"
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
																setSuspendId(
																	v.id,
																)
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
				</FadeIn>
			)}

			{detailId && (
				<Overlay onClick={() => setDetailId(null)}>
					<Modal onClick={(e) => e.stopPropagation()}>
						<Stack $gap={16}>
							<Row $justify="space-between" $align="center">
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
								<Stack $gap={12}>
									{[0, 1, 2, 3, 4].map((i) => (
										<Skeleton key={i} $h={18} />
									))}
								</Stack>
							) : (
								<>
									<Row $gap={12} $align="center">
										<Avatar
											name={detail.businessName ?? "?"}
											size={48}
										/>
										<Stack $gap={2}>
											<Text $weight={800} $size={16}>
												{detail.businessName ?? "—"}
											</Text>
											<Badge $tone={tone(detail.status)}>
												{statusLabel(detail.status)}
											</Badge>
										</Stack>
									</Row>
									<Stack $gap={0}>
										<KV>
											<Text $muted>Email</Text>
											<Text $weight={600}>
												{detail.email}
											</Text>
										</KV>
										<KV>
											<Text $muted>Type</Text>
											<Text $weight={600}>
												{detail.vendorType
													? statusLabel(
															detail.vendorType,
														)
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
											<Text $muted>
												Profile completeness
											</Text>
											<Text $weight={600}>
												{detail.profileCompleteness}%
											</Text>
										</KV>
										<KV>
											<Text $muted>Open for orders</Text>
											<Badge
												$tone={
													detail.isOpenForOrders
														? "success"
														: "muted"
												}
											>
												{detail.isOpenForOrders
													? "Yes"
													: "No"}
											</Badge>
										</KV>
										{detail.categories.length > 0 && (
											<KV>
												<Text $muted>Categories</Text>
												<Text $weight={600}>
													{detail.categories
														.map((c) =>
															statusLabel(c),
														)
														.join(", ")}
												</Text>
											</KV>
										)}
									</Stack>
								</>
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
