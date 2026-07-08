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
	Stack,
	Text,
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

	return (
		<Stack $gap={4}>
			<Row $justify="space-between">
				<Heading $size={26}>Campuses</Heading>
				<Button onClick={() => open("new")}>+ Add campus</Button>
			</Row>
			<Text $muted>Campuses buyers and vendors belong to.</Text>

			{isLoading ? (
				<PageLoader />
			) : campuses.length === 0 ? (
				<Card style={{ marginTop: "var(--pc-space-5)" }}>
					<Text $muted style={{ textAlign: "center" }}>
						No campuses yet.
					</Text>
				</Card>
			) : (
				<Card style={{ padding: 0, marginTop: "var(--pc-space-5)" }}>
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
										<td>{c.name}</td>
										<td>{c.shortCode}</td>
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
										<td>
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
								<label
									style={{
										display: "flex",
										gap: 8,
										alignItems: "center",
										fontSize: 14,
										fontWeight: 600,
									}}
								>
									<input
										type="checkbox"
										checked={isActive}
										onChange={(e) =>
											setIsActive(e.target.checked)
										}
									/>
									Active
								</label>
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
