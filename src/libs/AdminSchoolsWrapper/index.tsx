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
	Select,
	Skeleton,
	Stack,
	StatCard,
	Title,
} from "@/components";
import { api } from "@/constants/api";
import { useToast } from "@/hooks/useToast";

type SchoolType = "University" | "Polytechnic" | "College of Education";
const SCHOOL_TYPES: SchoolType[] = [
	"University",
	"Polytechnic",
	"College of Education",
];

interface AdminSchool {
	id: string;
	name: string;
	state: string;
	type: SchoolType;
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

export default function AdminSchoolsWrapper() {
	const { toast } = useToast();
	const { data, isLoading, mutate } = useSWR<AdminSchool[]>("/admin/schools");
	const [adding, setAdding] = useState(false);
	const [name, setName] = useState("");
	const [state, setState] = useState("");
	const [type, setType] = useState<SchoolType>("University");
	const [busy, setBusy] = useState(false);
	const [togglingId, setTogglingId] = useState<string | null>(null);

	async function create() {
		setBusy(true);
		try {
			await api.post("/admin/schools", {
				name: name.trim(),
				state: state.trim(),
				type,
			});
			toast("School created", "success");
			setAdding(false);
			setName("");
			setState("");
			setType("University");
			await mutate();
		} catch (err: any) {
			toast(
				err.response?.data?.message ?? "Could not create school",
				"error",
			);
		} finally {
			setBusy(false);
		}
	}

	async function toggle(id: string) {
		setTogglingId(id);
		try {
			await api.patch(`/admin/schools/${id}/toggle-active`);
			await mutate();
		} catch (err: any) {
			toast(
				err.response?.data?.message ?? "Could not update school",
				"error",
			);
		} finally {
			setTogglingId(null);
		}
	}

	const schools = data ?? [];
	const valid = name.trim() && state.trim();
	const activeCount = schools.filter((s) => s.isActive).length;

	return (
		<Stack $gap={4}>
			<PageHeader
				eyebrow="Directory"
				title="Schools"
				subtitle="The school directory used during vendor onboarding."
				actions={
					<Button $pill onClick={() => setAdding(true)}>
						+ Add school
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
									<th>Type</th>
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
			) : schools.length === 0 ? (
				<EmptyState
					icon="🎓"
					title="No schools yet"
					description="Add schools to the directory so vendors can pick theirs during onboarding."
					action={
						<Button $pill onClick={() => setAdding(true)}>
							+ Add school
						</Button>
					}
				/>
			) : (
				<FadeIn>
					<Stack $gap={16}>
						<Grid $min={200} $gap={14}>
							<StatCard
								label="Total schools"
								value={schools.length}
								icon="🎓"
							/>
							<StatCard
								label="Active"
								value={activeCount}
								icon="✅"
								tone="var(--pc-color-accent)"
							/>
							<StatCard
								label="Inactive"
								value={schools.length - activeCount}
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
											<th>Type</th>
											<th>State</th>
											<th>Status</th>
											<th></th>
										</tr>
									</thead>
									<tbody>
										{schools.map((s) => (
											<tr key={s.id}>
												<td className="name">
													{s.name}
												</td>
												<td>
													<Badge $tone="muted">
														{s.type}
													</Badge>
												</td>
												<td>{s.state}</td>
												<td>
													<Badge
														$tone={
															s.isActive
																? "success"
																: "muted"
														}
													>
														{s.isActive
															? "Active"
															: "Inactive"}
													</Badge>
												</td>
												<td className="right">
													<Button
														$variant="secondary"
														$size="sm"
														$loading={
															togglingId === s.id
														}
														onClick={() =>
															toggle(s.id)
														}
													>
														{s.isActive
															? "Deactivate"
															: "Activate"}
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

			{adding && (
				<Overlay onClick={() => setAdding(false)}>
					<Modal onClick={(e) => e.stopPropagation()}>
						<Stack $gap={14}>
							<Title $size={18}>Add school</Title>
							<Input
								label="Name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="University of Ibadan"
							/>
							<Select
								label="Type"
								value={type}
								onChange={(e) =>
									setType(e.target.value as SchoolType)
								}
							>
								{SCHOOL_TYPES.map((t) => (
									<option key={t} value={t}>
										{t}
									</option>
								))}
							</Select>
							<Input
								label="State"
								value={state}
								onChange={(e) => setState(e.target.value)}
								placeholder="Oyo"
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
