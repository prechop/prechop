"use client";

import { useState } from "react";
import styled from "styled-components";
import useSWR from "swr";
import {
	Badge,
	Button,
	Card,
	Input,
	Select,
	Skeleton,
	Stack,
	Text,
} from "@/components";
import { api, apiData } from "@/constants/api";
import { fetcher } from "@/constants/fetcher";
import { useToast } from "@/hooks/useToast";

interface Statement {
	effect: "Allow" | "Deny";
	actions: string[];
}
interface Policy {
	id?: string;
	_id?: string;
	name: string;
	description?: string;
	isBuiltIn: boolean;
	statements: Statement[];
}
interface CatalogGroup {
	key: string;
	label: string;
	actions: { action: string; description: string }[];
}

const Row = styled.div`
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: 12px;
	padding: 12px 0;
	border-bottom: 1px solid var(--pc-border);
`;
const ActionGrid = styled.div`
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
	gap: 4px 14px;
	max-height: 260px;
	overflow-y: auto;
	padding: 4px 2px;
`;
const Check = styled.label`
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 13px;
	cursor: pointer;
`;

export default function PoliciesTab() {
	const { toast } = useToast();
	const { data, isLoading, mutate } = useSWR<Policy[]>(
		"/admin/iam/policies",
		fetcher,
	);
	const { data: catalog } = useSWR<CatalogGroup[]>(
		"/admin/iam/catalog",
		fetcher,
	);

	const [creating, setCreating] = useState(false);
	const [name, setName] = useState("");
	const [effect, setEffect] = useState<"Allow" | "Deny">("Allow");
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [busy, setBusy] = useState(false);

	function toggleAction(a: string) {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(a)) next.delete(a);
			else next.add(a);
			return next;
		});
	}

	async function create() {
		if (!name.trim() || selected.size === 0) {
			toast("Name and at least one action are required.", "error");
			return;
		}
		setBusy(true);
		try {
			await apiData(
				api.post("/admin/iam/policies", {
					name,
					statements: [{ effect, actions: [...selected] }],
				}),
			);
			toast("Policy created.", "success");
			setCreating(false);
			setName("");
			setSelected(new Set());
			await mutate();
		} catch {
			toast("Could not create policy (name taken or invalid).", "error");
		} finally {
			setBusy(false);
		}
	}

	async function remove(p: Policy) {
		if (!confirm(`Delete policy "${p.name}"?`)) return;
		try {
			await apiData(api.delete(`/admin/iam/policies/${p.id ?? p._id}`));
			toast("Policy deleted.", "success");
			await mutate();
		} catch {
			toast("Delete failed.", "error");
		}
	}

	return (
		<Stack $gap={16}>
			<div style={{ display: "flex", justifyContent: "flex-end" }}>
				<Button onClick={() => setCreating((v) => !v)}>
					{creating ? "Cancel" : "New policy"}
				</Button>
			</div>

			{creating && (
				<Card>
					<Stack $gap={12}>
						<Input
							placeholder="Policy name"
							value={name}
							onChange={(e) => setName(e.target.value)}
						/>
						<Select
							value={effect}
							onChange={(e) =>
								setEffect(e.target.value as "Allow" | "Deny")
							}
							style={{ maxWidth: 180 }}
						>
							<option value="Allow">Allow</option>
							<option value="Deny">Deny</option>
						</Select>
						{(catalog ?? []).map((g) => (
							<div key={g.key}>
								<Text $weight={700} $size={13}>
									{g.label}
								</Text>
								<ActionGrid>
									{g.actions.map((a) => (
										<Check key={a.action}>
											<input
												type="checkbox"
												checked={selected.has(a.action)}
												onChange={() =>
													toggleAction(a.action)
												}
											/>
											{a.action}
										</Check>
									))}
								</ActionGrid>
							</div>
						))}
						<Button
							onClick={create}
							$loading={busy}
							disabled={busy}
						>
							Create policy
						</Button>
					</Stack>
				</Card>
			)}

			<Card>
				{isLoading ? (
					<Skeleton style={{ height: 160 }} />
				) : (
					(data ?? []).map((p) => (
						<Row key={p.id ?? p._id}>
							<div>
								<Text $weight={700}>
									{p.name}{" "}
									{p.isBuiltIn && (
										<Badge $tone="muted">Built-in</Badge>
									)}
								</Text>
								<Text $muted $size={12}>
									{p.statements
										.map(
											(s) =>
												`${s.effect}: ${s.actions.join(", ")}`,
										)
										.join(" · ")}
								</Text>
							</div>
							{!p.isBuiltIn && (
								<Button
									$variant="ghost"
									$size="sm"
									onClick={() => remove(p)}
								>
									Delete
								</Button>
							)}
						</Row>
					))
				)}
			</Card>
		</Stack>
	);
}
