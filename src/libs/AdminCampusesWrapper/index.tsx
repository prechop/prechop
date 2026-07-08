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
	Grid,
	Input,
	PageHeader,
	Row,
	Skeleton,
	Stack,
	StatCard,
	Title,
} from "@/components";
import { api } from "@/constants/api";
import { useToast } from "@/hooks/useToast";

interface AdminCampus {
	id: string;
	name: string;
	shortCode: string;
	state: string;
	isActive: boolean;
}

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
	td.code {
		font-family: var(--pc-font-display);
		font-weight: 700;
		letter-spacing: 0.02em;
		color: var(--pc-color-primary);
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
	box-shadow: var(--pc-shadow-lg);
	animation: pc-fade-up var(--pc-dur-slow) var(--pc-ease) both;
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

type Editing = AdminCampus | "new" | null;

export default function AdminCampusesWrapper() {
	const { toast } = useToast();
	const { data, isLoading, mutate } =
		useSWR<AdminCampus[]>("/admin/campuses");
	const [editing, setEditing] = useState<Editing>(null);
	const [name, setName] = useState("");
	const [shortCode, setShortCode] = useState("");
	const [state, setState] = useState("");
	const [isActive, setIsActive] = useState(true);
	const [busy, setBusy] = useState(false);

	function open(target: Editing) {
		if (target === "new") {
			setName("");
			setShortCode("");
			setState("");
			setIsActive(true);
		} else if (target) {
			setName(target.name);
			setShortCode(target.shortCode);
			setState(target.state);
			setIsActive(target.isActive);
		}
		setEditing(target);
	}

	async function save() {
		setBusy(true);
		try {
			if (editing === "new") {
				await api.post("/admin/campuses", {
					name: name.trim(),
					shortCode: shortCode.trim(),
					state: state.trim(),
				});
				toast("Campus created", "success");
			} else if (editing) {
				await api.patch(`/admin/campuses/${editing.id}`, {
					name: name.trim(),
					shortCode: shortCode.trim(),
					state: state.trim(),
					isActive,
				});
				toast("Campus updated", "success");
			}
			setEditing(null);
			await mutate();
		} catch (err: any) {
			toast(
				err.response?.data?.message ?? "Could not save campus",
				"error",
			);
		} finally {
			setBusy(false);
		}
	}

	const campuses = data ?? [];
	const valid = name.trim() && shortCode.trim() && state.trim();
	const activeCount = campuses.filter((c) => c.isActive).length;

	return (
		<Stack $gap={4}>
			<PageHeader
				eyebrow="Directory"
				title="Campuses"
				subtitle="Campuses buyers and vendors belong to."
				actions={
					<Button $pill onClick={() => open("new")}>
						+ Add campus
					</Button>
				}
			/>

			{isLoading ? (
				<Card $pad={0}>
					<Scroll>
						<Table>
							<thead>
								<tr>
									<th>Name</th>
									<th>Short code</th>
									<th>State</th>
									<th>Status</th>
									<th></th>
								</tr>
							</thead>
							<tbody>
								{Array.from({ length: 5 }).map((_, i) => (
									<tr key={i}>
										{Array.from({ length: 5 }).map(
											(__, j) => (
												<td key={j}>
													<Skeleton $h={16} />
												</td>
											),
										)}
									</tr>
								))}
							</tbody>
						</Table>
					</Scroll>
				</Card>
			) : campuses.length === 0 ? (
				<EmptyState
					icon="🏫"
					title="No campuses yet"
					description="Add your first campus to start onboarding buyers and vendors."
					action={
						<Button $pill onClick={() => open("new")}>
							+ Add campus
						</Button>
					}
				/>
			) : (
				<FadeIn>
					<Stack $gap={16}>
						<Grid $min={200} $gap={14}>
							<StatCard
								label="Total campuses"
								value={campuses.length}
								icon="🏫"
							/>
							<StatCard
								label="Active"
								value={activeCount}
								icon="✅"
								tone="var(--pc-color-accent)"
							/>
							<StatCard
								label="Inactive"
								value={campuses.length - activeCount}
								icon="⏸️"
								tone="var(--pc-surface-3)"
							/>
						</Grid>
						<Card $pad={0}>
							<Scroll>
								<Table>
									<thead>
										<tr>
											<th>Name</th>
											<th>Short code</th>
											<th>State</th>
											<th>Status</th>
											<th></th>
										</tr>
									</thead>
									<tbody>
										{campuses.map((c) => (
											<tr key={c.id}>
												<td className="name">
													{c.name}
												</td>
												<td className="code">
													{c.shortCode}
												</td>
												<td>{c.state}</td>
												<td>
													<Badge
														$tone={
															c.isActive
																? "success"
																: "muted"
														}
													>
														{c.isActive
															? "Active"
															: "Inactive"}
													</Badge>
												</td>
												<td className="right">
													<Button
														$variant="ghost"
														$size="sm"
														onClick={() => open(c)}
													>
														Edit
													</Button>
												</td>
											</tr>
										))}
									</tbody>
								</Table>
							</Scroll>
						</Card>
					</Stack>
				</FadeIn>
			)}

			{editing && (
				<Overlay onClick={() => setEditing(null)}>
					<Modal onClick={(e) => e.stopPropagation()}>
						<Stack $gap={14}>
							<Title $size={18}>
								{editing === "new"
									? "Add campus"
									: "Edit campus"}
							</Title>
							<Input
								label="Name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="University of Lagos"
							/>
							<Input
								label="Short code"
								value={shortCode}
								onChange={(e) => setShortCode(e.target.value)}
								placeholder="UNILAG"
							/>
							<Input
								label="State"
								value={state}
								onChange={(e) => setState(e.target.value)}
								placeholder="Lagos"
							/>
							{editing !== "new" && (
								<CheckRow>
									<input
										type="checkbox"
										checked={isActive}
										onChange={(e) =>
											setIsActive(e.target.checked)
										}
									/>
									Active
								</CheckRow>
							)}
							<Row $gap={10} $justify="flex-end">
								<Button
									$variant="secondary"
									onClick={() => setEditing(null)}
								>
									Cancel
								</Button>
								<Button
									$loading={busy}
									disabled={!valid}
									onClick={save}
								>
									Save
								</Button>
							</Row>
						</Stack>
					</Modal>
				</Overlay>
			)}
		</Stack>
	);
}
