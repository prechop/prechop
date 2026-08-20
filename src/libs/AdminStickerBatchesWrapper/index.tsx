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
	Input,
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
import { useToast } from "@/hooks/useToast";

interface StickerBatch {
	_id: string;
	id?: string;
	vendorId: string;
	batchLabel: string;
	startCode: string;
	endCode: string;
	startSequence: number;
	endSequence: number;
	quantity: number;
	status: "ACTIVE" | "EXHAUSTED";
	notes?: string;
	printedAt?: string;
	shippedAt?: string;
	completedAt?: string;
	createdAt: string;
	updatedAt: string;
}

interface VendorOption {
	id: string;
	businessName?: string;
	vendorShortId?: string;
}

const tone = (s: string) =>
	s === "ACTIVE" ? "success" : s === "EXHAUSTED" ? "muted" : "warning";

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
const ModalCard = styled(Card)`
	width: min(600px, 100%);
	max-height: 90dvh;
	overflow-y: auto;
	box-shadow: var(--pc-shadow-lg);
`;
const MonoText = styled(Text)`
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
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

export default function AdminStickerBatchesWrapper() {
	const { toast } = useToast();
	const [vendorId, setVendorId] = useState("");
	const [showCreate, setShowCreate] = useState(false);
	const [detailId, setDetailId] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const { data: vendors } = useSWR<VendorOption[]>("/admin/vendors", {
		revalidateIfStale: false,
		revalidateOnFocus: false,
	});
	const vendorOptions = vendors ?? [];

	const { data: batches, isLoading, mutate } = useSWR<StickerBatch[]>(
		vendorId ? `/admin/sticker-batches?vendorId=${vendorId}` : null,
	);
	const { data: detail } = useSWR<StickerBatch>(
		detailId ? `/admin/sticker-batches?vendorId=${detailId}` : null,
	);

	async function createBatch(payload: any) {
		setBusy(true);
		try {
			await api.post("/admin/sticker-batches", payload);
			toast("Sticker batch created", "success");
			setShowCreate(false);
			await mutate();
			await globalMutate(`/admin/sticker-batches?vendorId=${vendorId}`);
		} catch (err: any) {
			toast(
				err.response?.data?.message ?? "Could not create batch",
				"error",
			);
		} finally {
			setBusy(false);
		}
	}

	const totalBatches = batches?.length ?? 0;
	const activeBatches = batches?.filter((b) => b.status === "ACTIVE").length ?? 0;
	const totalQuantity = batches?.reduce((sum, b) => sum + b.quantity, 0) ?? 0;

	return (
		<Stack $gap={20}>
			<PageHeader
				eyebrow="Admin console"
				title="Sticker batches"
				subtitle="Manage sequential delivery code batches for vendors."
				actions={
					<Button
						$pill
						disabled={!vendorId}
						onClick={() => setShowCreate(true)}
					>
						New batch
					</Button>
				}
			/>

			<FadeIn>
				<Grid $min={200} $gap={16}>
					<StatCard
						label="Total batches"
						value={totalBatches}
						icon="🏷️"
						tone="var(--pc-gradient-warm)"
					/>
					<StatCard
						label="Active batches"
						value={activeBatches}
						icon="✅"
						tone="var(--pc-color-accent)"
					/>
					<StatCard
						label="Total stickers"
						value={totalQuantity}
						icon="🔢"
						tone="var(--pc-surface-2)"
					/>
				</Grid>
			</FadeIn>

			<Toolbar>
				<FilterField>
					<Select
						label="Select vendor"
						value={vendorId}
						onChange={(e) => setVendorId(e.target.value)}
					>
						<option value="">Choose a vendor...</option>
						{vendorOptions.map((v) => (
							<option key={v.id} value={v.id}>
								{v.businessName ?? "?"} ({v.vendorShortId ?? "—"})
							</option>
						))}
					</Select>
				</FilterField>
			</Toolbar>

			{!vendorId ? (
				<FadeIn>
					<EmptyState
						icon="🏷️"
						title="Select a vendor"
						description="Choose a vendor above to view their sticker batches."
					/>
				</FadeIn>
			) : isLoading ? (
				<LoadingTable />
			) : batches && batches.length === 0 ? (
				<FadeIn>
					<EmptyState
						icon="🏷️"
						title="No sticker batches"
						description="This vendor has no sticker batches yet. Create one to get started."
					/>
				</FadeIn>
			) : (
				<FadeIn>
					<Card $pad={0}>
						<Scroll>
							<Table>
								<thead>
									<tr>
										<th>Vendor</th>
										<th>Batch label</th>
										<th>Start code</th>
										<th>End code</th>
										<th>Sequence</th>
										<th>Qty</th>
										<th>Status</th>
										<th>Created</th>
										<th>Actions</th>
									</tr>
								</thead>
								<tbody>
									{batches?.map((b) => (
										<tr key={b._id}>
											<td>
												<Text $weight={600}>
													{vendorOptions.find(
														(v) => v.id === b.vendorId,
													)?.businessName ?? b.vendorId}
												</Text>
											</td>
											<td>{b.batchLabel}</td>
											<td>
												<MonoText>{b.startCode}</MonoText>
											</td>
											<td>
												<MonoText>{b.endCode}</MonoText>
											</td>
											<td>
												{b.startSequence} → {b.endSequence}
											</td>
											<td>{b.quantity}</td>
											<td>
												<Badge $tone={tone(b.status)}>
													{b.status}
												</Badge>
											</td>
											<td>
												{new Date(b.createdAt).toLocaleDateString()}
											</td>
											<td>
												<Button
													$variant="ghost"
													$size="sm"
													onClick={() =>
														setDetailId(b._id)
													}
												>
													View
												</Button>
											</td>
										</tr>
									))}
								</tbody>
							</Table>
						</Scroll>
					</Card>
				</FadeIn>
			)}

			{showCreate && (
				<CreateBatchModal
					vendorId={vendorId}
					vendorOptions={vendorOptions}
					busy={busy}
					onClose={() => setShowCreate(false)}
					onSubmit={createBatch}
				/>
			)}

			{detailId && (
				<Overlay onClick={() => setDetailId(null)}>
					<ModalCard onClick={(e) => e.stopPropagation()}>
						<Stack $gap={16}>
							<Row $justify="space-between" $align="center">
								<Title $size={18}>
									Batch detail
								</Title>
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
											name={
												vendorOptions.find(
													(v) =>
														v.id === detail.vendorId,
												)?.businessName ?? "?"
											}
											size={40}
										/>
										<Stack $gap={2}>
											<Text $weight={800} $size={15}>
												{vendorOptions.find(
													(v) =>
														v.id === detail.vendorId,
												)?.businessName ??
													detail.vendorId}
											</Text>
											<Text $muted $size={12.5}>
												{vendorOptions.find(
													(v) =>
														v.id === detail.vendorId,
												)?.vendorShortId ?? "—"}
											</Text>
										</Stack>
									</Row>
									<Stack $gap={0}>
										<KV>
											<Text $muted>
												Batch label
											</Text>
											<Text $weight={600}>
												{detail.batchLabel}
											</Text>
										</KV>
										<KV>
											<Text $muted>
												Code range
											</Text>
											<Text $weight={600}>
												{detail.startCode} → {detail.endCode}
											</Text>
										</KV>
										<KV>
											<Text $muted>
												Sequence range
											</Text>
											<Text $weight={600}>
												{detail.startSequence} → {detail.endSequence}
											</Text>
										</KV>
										<KV>
											<Text $muted>
												Quantity
											</Text>
											<Text $weight={600}>
												{detail.quantity}
											</Text>
										</KV>
										<KV>
											<Text $muted>Status</Text>
											<Badge $tone={tone(detail.status)}>
												{detail.status}
											</Badge>
										</KV>
										{detail.notes && (
											<KV>
												<Text $muted>Notes</Text>
												<Text $weight={600}>
													{detail.notes}
												</Text>
											</KV>
										)}
										<KV>
											<Text $muted>Created</Text>
											<Text $weight={600}>
												{new Date(detail.createdAt).toLocaleString()}
											</Text>
										</KV>
										{detail.printedAt && (
											<KV>
												<Text $muted>
													Printed at
												</Text>
												<Text $weight={600}>
													{new Date(detail.printedAt).toLocaleString()}
												</Text>
											</KV>
										)}
										{detail.shippedAt && (
											<KV>
												<Text $muted>
													Shipped at
												</Text>
												<Text $weight={600}>
													{new Date(detail.shippedAt).toLocaleString()}
												</Text>
											</KV>
										)}
										{detail.completedAt && (
											<KV>
												<Text $muted>
													Completed at
												</Text>
												<Text $weight={600}>
													{new Date(detail.completedAt).toLocaleString()}
												</Text>
											</KV>
										)}
									</Stack>
								</>
							)}
						</Stack>
					</ModalCard>
				</Overlay>
			)}
		</Stack>
	);
}

function CreateBatchModal({
	vendorId,
	vendorOptions,
	busy,
	onClose,
	onSubmit,
}: {
	vendorId: string;
	vendorOptions: VendorOption[];
	busy: boolean;
	onClose: () => void;
	onSubmit: (payload: any) => Promise<void>;
}) {
	const [form, setForm] = useState({
		vendorId,
		batchLabel: "",
		startCode: "",
		endCode: "",
		startSequence: 1001,
		endSequence: 1100,
		notes: "",
		printedAt: "",
		shippedAt: "",
	});

	function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
		setForm((f) => ({ ...f, [key]: value }));
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		await onSubmit({
			...form,
			printedAt: form.printedAt || undefined,
			shippedAt: form.shippedAt || undefined,
		});
	}

	return (
		<Overlay onClick={onClose}>
			<ModalCard onClick={(e) => e.stopPropagation()}>
				<form onSubmit={handleSubmit}>
					<Stack $gap={14}>
						<Title $size={18}>
							Create sticker batch
						</Title>
						<Text $muted $size={13}>
							Create a new sequential batch of delivery code stickers
							for a vendor. The sequence must continue from the
							vendor's last batch.
						</Text>
						<Select
							label="Vendor"
							value={form.vendorId}
							onChange={(e) =>
								set("vendorId", e.target.value)
							}
						>
							<option value="">Select vendor...</option>
							{vendorOptions.map((v) => (
								<option key={v.id} value={v.id}>
									{v.businessName ?? "?"} (
									{v.vendorShortId ?? "—"})
								</option>
							))}
						</Select>
						<Input
							label="Batch label"
							value={form.batchLabel}
							onChange={(e) =>
								set("batchLabel", e.target.value)
							}
							placeholder="e.g. Batch 1 - Initial"
							required
						/>
						<Grid $min={180} $gap={12}>
							<Input
								label="Start code"
								value={form.startCode}
								onChange={(e) =>
									set("startCode", e.target.value)
								}
								placeholder="e.g. CHI1001"
								required
							/>
							<Input
								label="End code"
								value={form.endCode}
								onChange={(e) =>
									set("endCode", e.target.value)
								}
								placeholder="e.g. CHI1100"
								required
							/>
						</Grid>
						<Grid $min={180} $gap={12}>
							<Input
								label="Start sequence"
								type="number"
								value={String(form.startSequence)}
								onChange={(e) =>
									set(
										"startSequence",
										Number(e.target.value) || 1001,
									)
								}
								required
							/>
							<Input
								label="End sequence"
								type="number"
								value={String(form.endSequence)}
								onChange={(e) =>
									set(
										"endSequence",
										Number(e.target.value) || 1001,
									)
								}
								required
							/>
						</Grid>
						<Textarea
							label="Notes"
							value={form.notes}
							onChange={(e) =>
								set("notes", e.target.value)
							}
							placeholder="Optional notes..."
							rows={3}
						/>
						<Grid $min={180} $gap={12}>
							<Input
								label="Printed at (optional)"
								type="date"
								value={form.printedAt}
								onChange={(e) =>
									set("printedAt", e.target.value)
								}
							/>
							<Input
								label="Shipped at (optional)"
								type="date"
								value={form.shippedAt}
								onChange={(e) =>
									set("shippedAt", e.target.value)
								}
							/>
						</Grid>
						<Row $gap={10} $justify="flex-end">
							<Button
								$variant="secondary"
								onClick={onClose}
								type="button"
							>
								Cancel
							</Button>
							<Button
								$variant="primary"
								$loading={busy}
								disabled={
									busy ||
									!form.vendorId ||
									!form.batchLabel ||
									!form.startCode ||
									!form.endCode
								}
								type="submit"
							>
								Create batch
							</Button>
						</Row>
					</Stack>
				</form>
			</ModalCard>
		</Overlay>
	);
}
