"use client";

import { useState } from "react";
import styled from "styled-components";
import useSWR, { mutate as globalMutate } from "swr";
import {
	Badge,
	Button,
	Card,
	EmptyState,
	Grid,
	Input,
	PageHeader,
	Row,
	Skeleton,
	Stack,
	Text,
	Title,
} from "@/components";
import { api } from "@/constants/api";
import { useToast } from "@/hooks/useToast";

interface FulfillmentLocation {
	_id: string;
	id?: string;
	name: string;
	state?: string;
	city?: string;
	campusOrSchool?: string;
	address?: string;
	isActive: boolean;
	createdAt: string;
	updatedAt: string;
}

const Scroll = styled.div`
	overflow-x: auto;
	border-radius: var(--pc-radius);
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
	box-shadow: var(--pc-shadow-lg);
	animation: pc-fade-up var(--pc-dur-slow) var(--pc-ease) both;
`;
const Field = styled.div`
	display: flex;
	flex-direction: column;
	gap: 6px;
`;
const CheckRow = styled.label`
	display: flex;
	gap: 10px;
	align-items: center;
	padding: 12px 14px;
	border: 1.5px solid var(--pc-border);
	border-radius: var(--pc-radius-sm);
	background: var(--pc-surface-2);
	font-size: 14px;
	font-weight: 700;
	cursor: pointer;
	input {
		width: 18px;
		height: 18px;
		accent-color: var(--pc-color-primary);
		cursor: pointer;
	}
`;

type Editing = FulfillmentLocation | "new" | null;

export default function AdminFulfillmentLocationsWrapper() {
	const { toast } = useToast();
	const { data, isLoading, mutate } =
		useSWR<FulfillmentLocation[]>("/admin/fulfillment-locations");
	const [editing, setEditing] = useState<Editing>(null);
	const [name, setName] = useState("");
	const [state, setState] = useState("");
	const [city, setCity] = useState("");
	const [campusOrSchool, setCampusOrSchool] = useState("");
	const [address, setAddress] = useState("");
	const [isActive, setIsActive] = useState(true);
	const [busy, setBusy] = useState(false);

	function open(target: Editing) {
		if (target === "new") {
			setName("");
			setState("");
			setCity("");
			setCampusOrSchool("");
			setAddress("");
			setIsActive(true);
		} else if (target) {
			setName(target.name);
			setState(target.state ?? "");
			setCity(target.city ?? "");
			setCampusOrSchool(target.campusOrSchool ?? "");
			setAddress(target.address ?? "");
			setIsActive(target.isActive);
		}
		setEditing(target);
	}

	async function save() {
		setBusy(true);
		try {
			if (editing === "new") {
				await api.post("/admin/fulfillment-locations", {
					name: name.trim(),
					state: state.trim() || undefined,
					city: city.trim() || undefined,
					campusOrSchool: campusOrSchool.trim() || undefined,
					address: address.trim() || undefined,
					isActive,
				});
				toast("Location created", "success");
			} else if (editing) {
				await api.patch("/admin/fulfillment-locations", {
					id: editing._id,
					name: name.trim(),
					state: state.trim() || undefined,
					city: city.trim() || undefined,
					campusOrSchool: campusOrSchool.trim() || undefined,
					address: address.trim() || undefined,
					isActive,
				});
				toast("Location updated", "success");
			}
			setEditing(null);
			await mutate();
			await globalMutate("/admin/fulfillment-locations");
		} catch (err: any) {
			toast(
				err.response?.data?.message ?? "Could not save location",
				"error",
			);
		} finally {
			setBusy(false);
		}
	}

	async function remove(loc: FulfillmentLocation) {
		if (!confirm(`Delete "${loc.name}"?`)) return;
		setBusy(true);
		try {
			await api.delete("/admin/fulfillment-locations", {
				data: { id: loc._id },
			});
			toast("Location deleted", "success");
			await mutate();
			await globalMutate("/admin/fulfillment-locations");
		} catch (err: any) {
			toast(
				err.response?.data?.message ?? "Could not delete location",
				"error",
			);
		} finally {
			setBusy(false);
		}
	}

	const locations = data ?? [];
	const valid = name.trim().length > 0;

	return (
		<Stack $gap={4}>
			<PageHeader
				eyebrow="Operations"
				title="Fulfillment locations"
				subtitle="Manage brand-kit delivery and pickup locations."
				actions={
					<Button $pill onClick={() => open("new")} disabled={busy}>
						+ Add location
					</Button>
				}
			/>
			<Card $pad={0}>
				<Scroll>
					<Table>
						<thead>
							<tr>
								<th>Name</th>
								<th>City</th>
								<th>State</th>
								<th>Campus / School</th>
								<th>Status</th>
								<th></th>
							</tr>
						</thead>
						<tbody>
							{isLoading ? (
								Array.from({ length: 4 }).map((_, i) => (
									<tr key={i}>
										{Array.from({ length: 6 }).map((__, j) => (
											<td key={j}>
												<Skeleton $h={14} />
											</td>
										))}
									</tr>
								))
							) : locations.length === 0 ? (
								<tr>
									<td colSpan={6}>
										<EmptyState
											title="No locations yet"
											description="Add the first brand-kit fulfillment location."
										/>
									</td>
								</tr>
							) : (
								locations.map((loc) => (
									<tr key={loc._id}>
										<td>
											<Text $weight={700}>{loc.name}</Text>
											<Text $muted $size={12}>
												{loc.address}
											</Text>
										</td>
										<td>{loc.city ?? "—"}</td>
										<td>{loc.state ?? "—"}</td>
										<td>{loc.campusOrSchool ?? "—"}</td>
										<td>
											<Badge $tone={loc.isActive ? "success" : "muted"}>
												{loc.isActive ? "Active" : "Inactive"}
											</Badge>
										</td>
										<td style={{ textAlign: "right" }}>
											<Row $gap={6}>
										<Button
											$variant="secondary"
											$size="sm"
											onClick={() => open(loc)}
											disabled={busy}
										>
											Edit
										</Button>
										<Button
											$variant="danger"
											$size="sm"
											onClick={() => remove(loc)}
											disabled={busy}
										>
											Delete
										</Button>
											</Row>
										</td>
									</tr>
								))
							)}
						</tbody>
					</Table>
				</Scroll>
			</Card>

			{editing && (
				<Overlay onClick={() => !busy && setEditing(null)}>
					<Modal onClick={(e) => e.stopPropagation()}>
						<Stack $gap={14}>
							<Title $size={18}>
								{editing === "new" ? "New location" : "Edit location"}
							</Title>
							<Grid $gap={12} style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)" }}>
								<Field>
									<Text $size={12} $weight={700} $muted>
										Name *
									</Text>
									<Input
										value={name}
										onChange={(e) => setName(e.target.value)}
										placeholder="e.g. Main Campus Hub"
										autoFocus
									/>
								</Field>
								<Field>
									<Text $size={12} $weight={700} $muted>
										City
									</Text>
									<Input
										value={city}
										onChange={(e) => setCity(e.target.value)}
										placeholder="e.g. Lagos"
									/>
								</Field>
								<Field>
									<Text $size={12} $weight={700} $muted>
										State
									</Text>
									<Input
										value={state}
										onChange={(e) => setState(e.target.value)}
										placeholder="e.g. Lagos"
									/>
								</Field>
								<Field>
									<Text $size={12} $weight={700} $muted>
										Campus / School
									</Text>
									<Input
										value={campusOrSchool}
										onChange={(e) => setCampusOrSchool(e.target.value)}
										placeholder="e.g. University of Lagos"
									/>
								</Field>
							</Grid>
							<Field>
								<Text $size={12} $weight={700} $muted>
									Address
								</Text>
								<Input
									value={address}
									onChange={(e) => setAddress(e.target.value)}
									placeholder="Street address"
								/>
							</Field>
							<CheckRow>
								<input
									type="checkbox"
									checked={isActive}
									onChange={(e) => setIsActive(e.target.checked)}
								/>
								<Text>Active</Text>
							</CheckRow>
							<Row $gap={8} $justify="flex-end">
								<Button
									$variant="secondary"
									onClick={() => setEditing(null)}
									disabled={busy}
								>
									Cancel
								</Button>
								<Button onClick={save} disabled={busy || !valid}>
									{busy ? "Saving..." : "Save"}
								</Button>
							</Row>
						</Stack>
					</Modal>
				</Overlay>
			)}
		</Stack>
	);
}
