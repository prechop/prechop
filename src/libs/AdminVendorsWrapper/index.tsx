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
	rating: number | null;
	totalOrders: number;
	totalReviews: number;
	vendorType?: string;
	description?: string;
	categories: string[];
	profileCompleteness: number;
	isOpenForOrders: boolean;
	campusId: string;
	vendorShortId?: string;
	brandKitPaymentStatus?: string;
	brandKitPaidAt?: string;
	brandKitFulfillmentStatus?: string;
	brandKitFulfillmentLocationId?: string;
	brandKitReceivedAt?: string;
	featureScheduleAhead?: boolean;
	featureWeeklyBreakfastPlan?: boolean;
	featureDelivery?: boolean;
	featurePickup?: boolean;
	deliveryCoverageType?: string;
	deliveryLocations?: string[];
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
	const [stickerVendorId, setStickerVendorId] = useState<string | null>(null);
	const [stickerPreview, setStickerPreview] = useState<{
		vendorName?: string;
		shortId?: string;
		exampleCode?: string;
		qrUrl?: string;
		qrDataUrl?: string;
		storeUrl?: string;
	} | null>(null);
	const [fulfillmentLocations, setFulfillmentLocations] = useState<
		{ _id: string; name: string; isActive: boolean }[]
	>([]);
	const [editingFulfillment, setEditingFulfillment] = useState(false);
	const [editFulfillmentStatus, setEditFulfillmentStatus] = useState("");
	const [editFulfillmentLocationId, setEditFulfillmentLocationId] =
		useState("");

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

	useEffect(() => {
		if (!detailId) return;
		let cancelled = false;
		async function loadLocations() {
			try {
				const res = await api.get("/admin/fulfillment-locations");
				if (!cancelled) {
					setFulfillmentLocations(
						res.data.data ?? [],
					);
				}
			} catch {
				// non-blocking
			}
		}
		loadLocations();
		return () => {
			cancelled = true;
		};
	}, [detailId]);

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

	async function previewVendorSticker(vendorId: string) {
		setStickerVendorId(vendorId);
		setBusy(true);
		try {
			const result = await api.post<{ data: { vendorName?: string; shortId?: string; exampleCode?: string; qrUrl?: string; storeUrl?: string } }>(
				"/stickers/preview",
				{ vendorId },
			);
			if (result.data?.data) {
				setStickerPreview(result.data.data);
			}
		} catch (err: any) {
			toast(
				err.response?.data?.message ?? "Could not load sticker preview",
				"error",
			);
		} finally {
			setBusy(false);
		}
	}

	async function saveFulfillment() {
		if (!detailId) return;
		setBusy(true);
		try {
			await api.patch(`/admin/vendors/${detailId}/brand-kit`, {
				status: editFulfillmentStatus,
				locationId: editFulfillmentLocationId || undefined,
			});
			toast("Brand Kit updated", "success");
			setEditingFulfillment(false);
			await mutate();
			if (detailId) await globalMutate(`/admin/vendors/${detailId}`);
		} catch (err: any) {
			toast(
				err.response?.data?.message ?? "Could not update Brand Kit",
				"error",
			);
		} finally {
			setBusy(false);
		}
	}

	function startEditFulfillment() {
		if (!detail) return;
		setEditFulfillmentStatus(detail.brandKitFulfillmentStatus ?? "NOT_STARTED");
		setEditFulfillmentLocationId(detail.brandKitFulfillmentLocationId ?? "");
		setEditingFulfillment(true);
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
										<th>Short ID</th>
										<th>Email</th>
										<th>Status</th>
										<th>Brand Kit</th>
										<th>Fulfillment</th>
										<th>Delivery</th>
										<th>Pickup</th>
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
													{v.vendorShortId ?? "—"}
												</Text>
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
												<Badge
													$tone={
														v.brandKitPaymentStatus ===
														"PAID"
															? "success"
															: v.brandKitPaymentStatus ===
															  "FAILED"
																? "danger"
																: "muted"
													}
												>
													{v.brandKitPaymentStatus ??
														"PENDING"}
												</Badge>
											</td>
											<td>
												<Badge
													$tone={
														v.brandKitFulfillmentStatus ===
														"RECEIVED"
															? "success"
															: v.brandKitFulfillmentStatus ===
															  "DELIVERED"
																? "warning"
																: v.brandKitFulfillmentStatus ===
																  "DISPATCHED"
																	? "primary"
																	: "muted"
													}
												>
													{v.brandKitFulfillmentStatus ??
														"NOT_STARTED"}
												</Badge>
											</td>
											<td>
												<Badge
													$tone={
														v.featureDelivery
															? "success"
															: "muted"
													}
												>
													{v.featureDelivery
														? "Yes"
														: "No"}
												</Badge>
											</td>
											<td>
												<Badge
													$tone={
														v.featurePickup
															? "success"
															: "muted"
													}
												>
													{v.featurePickup
														? "Yes"
														: "No"}
												</Badge>
											</td>
											<td>
												<Rating>
													{v.rating?.toFixed(1) ??
														"—"}
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
											<Text $muted>Short ID</Text>
											<Text $weight={600}>
												{detail.vendorShortId ?? "—"}
											</Text>
										</KV>
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
										<Text $muted>Brand Kit</Text>
										<Badge
											$tone={
												detail.brandKitPaymentStatus ===
												"PAID"
													? "success"
													: detail.brandKitPaymentStatus ===
													  "FAILED"
														? "danger"
														: "muted"
											}
										>
											{detail.brandKitPaymentStatus ??
												"PENDING"}
										</Badge>
									</KV>
									{detail.brandKitPaidAt && (
										<KV>
											<Text $muted>
												Brand Kit paid at
											</Text>
											<Text $weight={600}>
												{new Date(detail.brandKitPaidAt).toLocaleString()}
											</Text>
										</KV>
									)}
									<KV>
										<Text $muted>
											Fulfillment status
										</Text>
										<Badge
											$tone={
												detail.brandKitFulfillmentStatus ===
												"RECEIVED"
													? "success"
													: detail.brandKitFulfillmentStatus ===
													  "DELIVERED"
														? "warning"
														: detail.brandKitFulfillmentStatus ===
														  "DISPATCHED"
															? "primary"
															: "muted"
											}
										>
											{detail.brandKitFulfillmentStatus ??
												"NOT_STARTED"}
										</Badge>
									</KV>
								{detail.brandKitReceivedAt && (
									<KV>
										<Text $muted>
											Brand Kit received at
										</Text>
										<Text $weight={600}>
											{new Date(detail.brandKitReceivedAt).toLocaleString()}
										</Text>
									</KV>
								)}
								<KV>
									<Text $muted>Fulfillment location</Text>
									<Text $weight={600}>
										{fulfillmentLocations.find(
											(l) =>
												l._id ===
												detail.brandKitFulfillmentLocationId,
										)?.name ??
											detail
												.brandKitFulfillmentLocationId
												? "—"
												: "Not assigned"}
									</Text>
								</KV>
								{!editingFulfillment ? (
									<KV>
										<Text $muted>
											Fulfillment status
										</Text>
										<Row $gap={8}>
											<Badge
												$tone={
													detail
														.brandKitFulfillmentStatus ===
													"RECEIVED"
														? "success"
														: detail
																.brandKitFulfillmentStatus ===
														  "DELIVERED"
															? "warning"
															: detail
																	.brandKitFulfillmentStatus ===
															  "DISPATCHED"
																? "primary"
																: "muted"
												}
											>
												{detail.brandKitFulfillmentStatus ??
													"NOT_STARTED"}
											</Badge>
											<Button
												$variant="secondary"
												$size="sm"
												onClick={startEditFulfillment}
												disabled={busy}
											>
												Edit
											</Button>
										</Row>
									</KV>
								) : (
									<KV>
										<Text $muted>
											Fulfillment status
										</Text>
										<Stack $gap={8}>
											<Select
												value={editFulfillmentStatus}
												onChange={(e) =>
													setEditFulfillmentStatus(
														e.target.value,
													)
												}
												disabled={busy}
											>
												<option value="NOT_STARTED">
													NOT_STARTED
												</option>
												<option value="PREPARING">
													PREPARING
												</option>
												<option value="DISPATCHED">
													DISPATCHED
												</option>
												<option value="DELIVERED">
													DELIVERED
												</option>
												<option value="RECEIVED">
													RECEIVED
												</option>
											</Select>
											<Select
												value={
													editFulfillmentLocationId
												}
												onChange={(e) =>
													setEditFulfillmentLocationId(
														e.target.value,
													)
												}
												disabled={busy}
												placeholder="Select location"
											>
												<option value="">—</option>
												{fulfillmentLocations
													.filter(
														(l) => l.isActive,
													)
													.map((l) => (
														<option
															key={l._id}
															value={l._id}
														>
															{l.name}
														</option>
													))}
											</Select>
											<Row $gap={8}>
												<Button
													$size="sm"
													onClick={saveFulfillment}
													disabled={busy}
												>
													Save
												</Button>
												<Button
													$variant="secondary"
													$size="sm"
													onClick={() =>
														setEditingFulfillment(
															false,
														)
													}
													disabled={busy}
												>
													Cancel
												</Button>
											</Row>
										</Stack>
									</KV>
								)}
							<KV>
											<Text $muted>
												Feature: Schedule Ahead
											</Text>
											<Badge
												$tone={
													detail.featureScheduleAhead
														? "success"
														: "muted"
												}
											>
												{detail.featureScheduleAhead
													? "ON"
													: "OFF"}
											</Badge>
										</KV>
										<KV>
											<Text $muted>
												Feature: Weekly Breakfast Plan
											</Text>
											<Badge
												$tone={
													detail.featureWeeklyBreakfastPlan
														? "success"
														: "muted"
												}
											>
												{detail.featureWeeklyBreakfastPlan
													? "ON"
													: "OFF"}
											</Badge>
										</KV>
										<KV>
											<Text $muted>
												Feature: Delivery
											</Text>
											<Badge
												$tone={
													detail.featureDelivery
														? "success"
														: "muted"
												}
											>
												{detail.featureDelivery
													? "ON"
													: "OFF"}
											</Badge>
										</KV>
										<KV>
											<Text $muted>
												Feature: Pickup
											</Text>
											<Badge
												$tone={
													detail.featurePickup
														? "success"
														: "muted"
												}
											>
												{detail.featurePickup
													? "ON"
													: "OFF"}
											</Badge>
										</KV>
										<KV>
											<Text $muted>
												Delivery coverage
											</Text>
											<Text $weight={600}>
												{detail.deliveryCoverageType ??
													"SPECIFIC"}
											</Text>
										</KV>
										{detail.deliveryLocations &&
											detail.deliveryLocations.length >
												0 && (
												<KV>
													<Text $muted>
														Delivery locations
													</Text>
													<Text $weight={600}>
														{detail.deliveryLocations.join(
															", ",
														)}
													</Text>
												</KV>
											)}
										<KV>
											<Text $muted>Rating</Text>
											<Text $weight={600}>
												{detail.rating?.toFixed(1) ??
													"—"}{" "}
												★ ({detail.totalReviews})
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
										<KV>
											<Text $muted>
												Delivery sticker
											</Text>
											<Button
												$variant="secondary"
												$size="sm"
												onClick={() =>
													previewVendorSticker(
														detail.id,
													)
												}
											>
												Preview sticker
											</Button>
										</KV>
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
			{stickerVendorId && (
				<Overlay onClick={() => { setStickerVendorId(null); setStickerPreview(null); }}>
					<Modal onClick={(e) => e.stopPropagation()}>
						<Stack $gap={14}>
							<Row $justify="space-between" $align="center">
								<Title $size={18}>Sticker preview</Title>
								<Button
									$variant="ghost"
									$size="sm"
									onClick={() => { setStickerVendorId(null); setStickerPreview(null); }}
								>
									Close
								</Button>
							</Row>
								{!stickerPreview ? (
									<Skeleton $h={200} />
								) : (
									<Stack $gap={10}>
										<Text $muted $size={12}>
											PreChop controls the design. Vendor details are inserted automatically.
										</Text>
										<Card $pad={24} style={{ width: "min(320px, 100%)", textAlign: "center" }}>
											<Stack $gap={10}>
												<Text $size={11} $weight={800} $muted style={{ textTransform: "uppercase", letterSpacing: "0.18em" }}>
													PreChop
												</Text>
												<Text $size={18} $weight={900}>
													{stickerPreview.vendorName ?? "Kitchen"}
												</Text>
												<Text $size={22} $weight={900} style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", color: "var(--pc-color-primary)" }}>
													{stickerPreview.exampleCode ?? "???"}
												</Text>
												{stickerPreview.qrDataUrl ? (
													<img
														src={stickerPreview.qrDataUrl}
														alt="QR code"
														width={120}
														height={120}
														style={{ borderRadius: "var(--pc-radius)", border: "1px solid var(--pc-border)" }}
													/>
												) : (
													<Text $muted $size={12}>
														QR → {stickerPreview.qrUrl ?? "/k/..."}
													</Text>
												)}
												<Text $size={11} $weight={700} $muted style={{ textTransform: "uppercase", letterSpacing: "0.12em" }}>
													Powered by PreChop
												</Text>
											</Stack>
										</Card>
									</Stack>
								)}
						</Stack>
					</Modal>
				</Overlay>
			)}
		</Stack>
	);
}
