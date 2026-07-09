"use client";

import { useState } from "react";
import styled from "styled-components";
import useSWR from "swr";
import {
	Badge,
	Button,
	Card,
	Input,
	Skeleton,
	Stack,
	Text,
} from "@/components";
import { api, apiData } from "@/constants/api";
import { fetcher } from "@/constants/fetcher";
import { useToast } from "@/hooks/useToast";

interface Policy {
	id?: string;
	_id?: string;
	name: string;
}
interface Group {
	id?: string;
	_id?: string;
	name: string;
	description?: string;
	isBuiltIn: boolean;
	policies: { id: string; name: string }[];
	policyIds: string[];
}

const Row = styled.div`
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	gap: 12px;
	padding: 12px 0;
	border-bottom: 1px solid var(--pc-border);
`;
const Check = styled.label`
	display: inline-flex;
	align-items: center;
	gap: 7px;
	font-size: 13px;
	margin-right: 14px;
	cursor: pointer;
`;

export default function GroupsTab() {
	const { toast } = useToast();
	const { data, isLoading, mutate } = useSWR<Group[]>(
		"/admin/iam/groups",
		fetcher,
	);
	const { data: policies } = useSWR<Policy[]>("/admin/iam/policies", fetcher);

	const [creating, setCreating] = useState(false);
	const [name, setName] = useState("");
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [editing, setEditing] = useState<string | null>(null);
	const [editSel, setEditSel] = useState<Set<string>>(new Set());

	const pid = (p: Policy) => (p.id ?? p._id) as string;

	async function create() {
		if (!name.trim()) return;
		try {
			await apiData(
				api.post("/admin/iam/groups", {
					name,
					policyIds: [...selected],
				}),
			);
			toast("Group created.", "success");
			setCreating(false);
			setName("");
			setSelected(new Set());
			await mutate();
		} catch {
			toast("Could not create group (name taken?).", "error");
		}
	}

	async function saveEdit(g: Group) {
		try {
			await apiData(
				api.patch(`/admin/iam/groups/${g.id ?? g._id}`, {
					policyIds: [...editSel],
				}),
			);
			toast("Group updated.", "success");
			setEditing(null);
			await mutate();
		} catch {
			toast("Update failed.", "error");
		}
	}

	async function remove(g: Group) {
		if (!confirm(`Delete group "${g.name}"?`)) return;
		try {
			await apiData(api.delete(`/admin/iam/groups/${g.id ?? g._id}`));
			toast("Group deleted.", "success");
			await mutate();
		} catch {
			toast("Delete failed.", "error");
		}
	}

	return (
		<Stack $gap={16}>
			<div style={{ display: "flex", justifyContent: "flex-end" }}>
				<Button onClick={() => setCreating((v) => !v)}>
					{creating ? "Cancel" : "New group"}
				</Button>
			</div>

			{creating && (
				<Card>
					<Stack $gap={12}>
						<Input
							placeholder="Group name"
							value={name}
							onChange={(e) => setName(e.target.value)}
						/>
						<div>
							<Text $muted $size={13}>
								Attach policies
							</Text>
							<div style={{ marginTop: 6 }}>
								{(policies ?? []).map((p) => (
									<Check key={pid(p)}>
										<input
											type="checkbox"
											checked={selected.has(pid(p))}
											onChange={() =>
												setSelected((prev) => {
													const n = new Set(prev);
													n.has(pid(p))
														? n.delete(pid(p))
														: n.add(pid(p));
													return n;
												})
											}
										/>
										{p.name}
									</Check>
								))}
							</div>
						</div>
						<Button onClick={create}>Create group</Button>
					</Stack>
				</Card>
			)}

			<Card>
				{isLoading ? (
					<Skeleton style={{ height: 160 }} />
				) : (
					(data ?? []).map((g) => {
						const gid = (g.id ?? g._id) as string;
						return (
							<Row key={gid}>
								<div style={{ flex: 1 }}>
									<Text $weight={700}>
										{g.name}{" "}
										{g.isBuiltIn && (
											<Badge $tone="muted">
												Built-in
											</Badge>
										)}
									</Text>
									<Text $muted $size={12}>
										{g.policies
											.map((p) => p.name)
											.join(", ") || "No policies"}
									</Text>
									{editing === gid && (
										<div style={{ marginTop: 8 }}>
											{(policies ?? []).map((p) => (
												<Check key={pid(p)}>
													<input
														type="checkbox"
														checked={editSel.has(
															pid(p),
														)}
														onChange={() =>
															setEditSel(
																(prev) => {
																	const n =
																		new Set(
																			prev,
																		);
																	n.has(
																		pid(p),
																	)
																		? n.delete(
																				pid(
																					p,
																				),
																			)
																		: n.add(
																				pid(
																					p,
																				),
																			);
																	return n;
																},
															)
														}
													/>
													{p.name}
												</Check>
											))}
											<div style={{ marginTop: 8 }}>
												<Button
													$size="sm"
													onClick={() => saveEdit(g)}
												>
													Save
												</Button>
											</div>
										</div>
									)}
								</div>
								{!g.isBuiltIn && (
									<div style={{ display: "flex", gap: 6 }}>
										<Button
											$variant="ghost"
											$size="sm"
											onClick={() => {
												setEditing(
													editing === gid
														? null
														: gid,
												);
												setEditSel(
													new Set(g.policyIds ?? []),
												);
											}}
										>
											{editing === gid ? "Close" : "Edit"}
										</Button>
										<Button
											$variant="ghost"
											$size="sm"
											onClick={() => remove(g)}
										>
											Delete
										</Button>
									</div>
								)}
							</Row>
						);
					})
				)}
			</Card>
		</Stack>
	);
}
