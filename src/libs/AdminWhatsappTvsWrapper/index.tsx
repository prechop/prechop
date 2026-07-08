"use client";

import { useState } from "react";
import styled from "styled-components";
import useSWR from "swr";
import {
	Badge,
	Button,
	Card,
	EmptyState,
	FadeIn,
	Input,
	PageHeader,
	Row,
	Select,
	Skeleton,
	Stack,
	Text,
	Title,
} from "@/components";
import { api } from "@/constants/api";
import { useToast } from "@/hooks/useToast";

interface AdminCampus {
	id: string;
	name: string;
}
interface WhatsappTv {
	id: string;
	campusId: string;
	name: string;
	audienceSize: number;
	priceRange?: string;
	isActive: boolean;
	displayOrder: number;
}

const Toolbar = styled(Card)`
	display: flex;
	flex-wrap: wrap;
	align-items: flex-end;
	gap: var(--pc-space-4);
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
		padding: 14px 16px;
		white-space: nowrap;
	}
	thead th {
		position: sticky;
		top: 0;
		background: var(--pc-surface-2);
		color: var(--pc-text-muted);
		font-weight: 700;
		font-size: 11.5px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
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
	td.name {
		font-weight: 700;
		color: var(--pc-text);
	}
	td.right {
		text-align: right;
	}
`;
const Overlay = styled.div`
	position: fixed;
	inset: 0;
	background: rgba(0, 0, 0, 0.5);
	backdrop-filter: blur(4px);
	display: flex;
	align-items: center;
	justify-content: center;
	padding: var(--pc-space-4);
	z-index: 80;
	animation: pc-fade-up var(--pc-dur) var(--pc-ease) both;
`;
const Modal = styled(Card)`
	width: min(460px, 100%);
	max-height: 90dvh;
	overflow-y: auto;
	box-shadow: var(--pc-shadow-lg);
	animation: pc-fade-up var(--pc-dur-slow) var(--pc-ease) both;
`;

export default function AdminWhatsappTvsWrapper() {
	const { toast } = useToast();
	const { data: campuses } = useSWR<AdminCampus[]>("/admin/campuses");
	const [campusId, setCampusId] = useState("");
	const [adding, setAdding] = useState(false);
	const [name, setName] = useState("");
	const [whatsappNumber, setWhatsappNumber] = useState("");
	const [audienceSize, setAudienceSize] = useState("");
	const [priceRange, setPriceRange] = useState("");
	const [displayOrder, setDisplayOrder] = useState("");
	const [busy, setBusy] = useState(false);
	const [deletingId, setDeletingId] = useState<string | null>(null);

	const { data, isLoading, mutate } = useSWR<WhatsappTv[]>(
		campusId ? `/admin/whatsapp-tvs?campusId=${campusId}` : null,
	);

	async function create() {
		setBusy(true);
		try {
			await api.post("/admin/whatsapp-tvs", {
				campusId,
				name: name.trim(),
				whatsappNumber: whatsappNumber.trim(),
				...(audienceSize ? { audienceSize: Number(audienceSize) } : {}),
				...(priceRange.trim() ? { priceRange: priceRange.trim() } : {}),
				...(displayOrder ? { displayOrder: Number(displayOrder) } : {}),
			});
			toast("WhatsApp TV created", "success");
			setAdding(false);
			setName("");
			setWhatsappNumber("");
			setAudienceSize("");
			setPriceRange("");
			setDisplayOrder("");
			await mutate();
		} catch (err: any) {
			toast(
				err.response?.data?.message ?? "Could not create TV",
				"error",
			);
		} finally {
			setBusy(false);
		}
	}

	async function remove(id: string) {
		setDeletingId(id);
		try {
			await api.delete(`/admin/whatsapp-tvs/${id}`);
			toast("WhatsApp TV deactivated", "success");
			await mutate();
		} catch (err: any) {
			toast(
				err.response?.data?.message ?? "Could not delete TV",
				"error",
			);
		} finally {
			setDeletingId(null);
		}
	}

	const tvs = data ?? [];
	const validNumber = /^234[789]\d{9}$/.test(
		whatsappNumber.trim().replace(/^\+/, ""),
	);
	const valid = name.trim() && validNumber;

	return (
		<Stack $gap={4}>
			<PageHeader
				eyebrow="Broadcast"
				title="WhatsApp TVs"
				subtitle="Broadcast channels used to promote listings per campus."
				actions={
					<Button
						$pill
						onClick={() => setAdding(true)}
						disabled={!campusId}
					>
						+ Add TV
					</Button>
				}
			/>

			<FadeIn>
				<Stack $gap={16}>
					<Toolbar>
						<div style={{ minWidth: 260, flex: 1 }}>
							<Select
								label="Campus"
								value={campusId}
								onChange={(e) => setCampusId(e.target.value)}
							>
								<option value="">Select a campus…</option>
								{(campuses ?? []).map((c) => (
									<option key={c.id} value={c.id}>
										{c.name}
									</option>
								))}
							</Select>
						</div>
					</Toolbar>

					{!campusId ? (
						<EmptyState
							icon="📺"
							title="Pick a campus"
							description="Choose a campus above to view and manage its WhatsApp TVs."
						/>
					) : isLoading ? (
						<Card $pad={0}>
							<Scroll>
								<Table>
									<thead>
										<tr>
											<th>Name</th>
											<th>Audience</th>
											<th>Price range</th>
											<th>Order</th>
											<th>Status</th>
											<th></th>
										</tr>
									</thead>
									<tbody>
										{Array.from({ length: 4 }).map(
											(_, i) => (
												<tr key={i}>
													{Array.from({
														length: 6,
													}).map((__, j) => (
														<td key={j}>
															<Skeleton $h={16} />
														</td>
													))}
												</tr>
											),
										)}
									</tbody>
								</Table>
							</Scroll>
						</Card>
					) : tvs.length === 0 ? (
						<EmptyState
							icon="📺"
							title="No WhatsApp TVs yet"
							description="This campus has no broadcast channels. Add one to start promoting listings."
							action={
								<Button $pill onClick={() => setAdding(true)}>
									+ Add TV
								</Button>
							}
						/>
					) : (
						<Card $pad={0}>
							<Scroll>
								<Table>
									<thead>
										<tr>
											<th>Name</th>
											<th>Audience</th>
											<th>Price range</th>
											<th>Order</th>
											<th>Status</th>
											<th></th>
										</tr>
									</thead>
									<tbody>
										{tvs.map((t) => (
											<tr key={t.id}>
												<td className="name">
													{t.name}
												</td>
												<td>
													{t.audienceSize.toLocaleString(
														"en-NG",
													)}
												</td>
												<td>{t.priceRange ?? "—"}</td>
												<td>{t.displayOrder}</td>
												<td>
													<Badge
														$tone={
															t.isActive
																? "success"
																: "muted"
														}
													>
														{t.isActive
															? "Active"
															: "Inactive"}
													</Badge>
												</td>
												<td className="right">
													<Button
														$variant="danger"
														$size="sm"
														$loading={
															deletingId === t.id
														}
														onClick={() =>
															remove(t.id)
														}
													>
														Delete
													</Button>
												</td>
											</tr>
										))}
									</tbody>
								</Table>
							</Scroll>
						</Card>
					)}
				</Stack>
			</FadeIn>

			{adding && (
				<Overlay onClick={() => setAdding(false)}>
					<Modal onClick={(e) => e.stopPropagation()}>
						<Stack $gap={14}>
							<Title $size={18}>Add WhatsApp TV</Title>
							<Input
								label="Name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="UNILAG Foodies"
							/>
							<Input
								label="WhatsApp number"
								value={whatsappNumber}
								onChange={(e) =>
									setWhatsappNumber(e.target.value)
								}
								placeholder="2348012345678"
							/>
							{whatsappNumber.trim() && !validNumber && (
								<Text
									$size={12}
									style={{ color: "var(--pc-color-danger)" }}
								>
									Expected a Nigerian number like
									2348012345678.
								</Text>
							)}
							<Input
								label="Audience size (optional)"
								type="number"
								value={audienceSize}
								onChange={(e) =>
									setAudienceSize(e.target.value)
								}
								placeholder="1200"
							/>
							<Input
								label="Price range (optional)"
								value={priceRange}
								onChange={(e) => setPriceRange(e.target.value)}
								placeholder="₦500 – ₦2,000"
							/>
							<Input
								label="Display order (optional)"
								type="number"
								value={displayOrder}
								onChange={(e) =>
									setDisplayOrder(e.target.value)
								}
								placeholder="0"
							/>
							<Row $gap={10} $justify="flex-end">
								<Button
									$variant="secondary"
									onClick={() => setAdding(false)}
								>
									Cancel
								</Button>
								<Button
									$loading={busy}
									disabled={!valid}
									onClick={create}
								>
									Create
								</Button>
							</Row>
						</Stack>
					</Modal>
				</Overlay>
			)}
		</Stack>
	);
}
