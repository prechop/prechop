"use client";

import { useState } from "react";
import styled from "styled-components";
import useSWR from "swr";
import {
	Badge,
	Button,
	Card,
	Heading,
	Input,
	PageLoader,
	Row,
	Select,
	Stack,
	Text,
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
	width: min(460px, 100%);
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

	return (
		<Stack $gap={4}>
			<Row $justify="space-between">
				<Heading $size={26}>Schools</Heading>
				<Button onClick={() => setAdding(true)}>+ Add school</Button>
			</Row>
			<Text $muted>
				The school directory used during vendor onboarding.
			</Text>

			{isLoading ? (
				<PageLoader />
			) : schools.length === 0 ? (
				<Card style={{ marginTop: "var(--pc-space-5)" }}>
					<Text $muted style={{ textAlign: "center" }}>
						No schools yet.
					</Text>
				</Card>
			) : (
				<Card style={{ padding: 0, marginTop: "var(--pc-space-5)" }}>
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
										<td>{s.name}</td>
										<td>{s.type}</td>
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
										<td>
											<Button
												$variant="secondary"
												$size="sm"
												$loading={togglingId === s.id}
												onClick={() => toggle(s.id)}
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
