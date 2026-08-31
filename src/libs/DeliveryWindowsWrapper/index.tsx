"use client";

import { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import {
	Badge,
	Button,
	Card,
	EmptyState,
	FadeIn,
	Input,
	PageLoader,
	PageHeader,
	Row,
	Select,
	Stack,
	Text,
	Title,
} from "@/components";
import { api } from "@/constants/api";
import { fetcher } from "@/constants/fetcher";
import { useToast } from "@/hooks/useToast";
import useSWR, { mutate as globalMutate } from "swr";
import type { DeliveryWindow } from "@/types";

const MEAL_TIMES = [
	{ value: "BREAKFAST", label: "Breakfast" },
	{ value: "LUNCH", label: "Lunch" },
	{ value: "DINNER", label: "Dinner" },
];

const DayCard = styled(Card)`
	padding: var(--pc-space-4) var(--pc-space-5);
`;

const emptyForm = {
	name: "",
	mealTime: "LUNCH" as DeliveryWindow["mealTime"],
	orderWindowStart: "08:00",
	orderWindowEnd: "12:00",
	deliveryWindowStart: "12:00",
	deliveryWindowEnd: "14:00",
	capacity: 50,
	active: true,
};

export default function DeliveryWindowsWrapper() {
	const { toast } = useToast();
	const { data, isLoading, mutate } = useSWR<DeliveryWindow[]>(
		"/delivery-windows",
		fetcher,
	);
	const { data: featureSettings } = useSWR<{
		breakfastEnabled: boolean;
		lunchEnabled: boolean;
		dinnerEnabled: boolean;
	}>("/vendors/me/feature-settings", fetcher);
	const [busy, setBusy] = useState(false);
	const [form, setForm] = useState(emptyForm);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);

	const windows = useMemo(() => data ?? [], [data]);

	useEffect(() => {
		return () => {};
	}, []);

	async function create(e: React.FormEvent) {
		e.preventDefault();
		if (!form.name.trim()) {
			toast("Window name is required.", "error");
			return;
		}
		setSaving(true);
		try {
			await api.post("/delivery-windows", form);
			toast("Delivery window created", "success");
			setForm(emptyForm);
			await mutate();
		} catch (err) {
			const message =
				(err as any)?.response?.data?.message ??
				(err instanceof Error ? err.message : "Failed to create window");
			toast(message, "error");
		} finally {
			setSaving(false);
		}
	}

	async function saveEdit() {
		if (!editingId) return;
		setSaving(true);
		try {
			await api.patch(`/delivery-windows/${editingId}`, form);
			toast("Delivery window updated", "success");
			setEditingId(null);
			setForm(emptyForm);
			await mutate();
		} catch (err) {
			const message =
				(err as any)?.response?.data?.message ??
				(err instanceof Error ? err.message : "Failed to update window");
			toast(message, "error");
		} finally {
			setSaving(false);
		}
	}

	async function remove(id: string) {
		setBusy(true);
		try {
			await api.delete(`/delivery-windows/${id}`);
			toast("Delivery window removed", "success");
			await mutate();
		} catch (err) {
			const message =
				(err as any)?.response?.data?.message ??
				(err instanceof Error ? err.message : "Failed to remove window");
			toast(message, "error");
		} finally {
			setBusy(false);
		}
	}

	function startEdit(w: DeliveryWindow) {
		setEditingId(w.id);
		setForm({
			name: w.name,
			mealTime: w.mealTime,
			orderWindowStart: w.orderWindowStart,
			orderWindowEnd: w.orderWindowEnd,
			deliveryWindowStart: w.deliveryWindowStart,
			deliveryWindowEnd: w.deliveryWindowEnd,
			capacity: w.capacity,
			active: w.active,
		});
	}

	function cancelEdit() {
		setEditingId(null);
		setForm(emptyForm);
	}

	if (isLoading) return <PageLoader />;

	return (
		<FadeIn>
			<PageHeader
				title="Delivery windows"
				subtitle="Manage order and delivery time slots per meal."
			/>
			<Stack $gap={24}>
				<Card>
					<Stack $gap={12}>
						<Text $weight={700} $size={18}>
							{editingId ? "Edit window" : "New window"}
						</Text>
						<form onSubmit={editingId ? (e) => { e.preventDefault(); saveEdit(); } : create}>
							<Stack $gap={12}>
								<Input
									label="Name"
									placeholder="e.g. Lunch rush"
									value={form.name}
									onChange={(e) => setForm({ ...form, name: e.target.value })}
								/>
							<Select
								label="Meal time"
								value={form.mealTime}
								onChange={(e) =>
									setForm({ ...form, mealTime: e.target.value as DeliveryWindow["mealTime"] })
								}
							>
								{MEAL_TIMES.filter((mt) => {
									if (mt.value === "BREAKFAST") return featureSettings?.breakfastEnabled !== false;
									if (mt.value === "LUNCH") return featureSettings?.lunchEnabled !== false;
									if (mt.value === "DINNER") return featureSettings?.dinnerEnabled !== false;
									return true;
								}).map((mt) => (
									<option key={mt.value} value={mt.value}>
										{mt.label}
									</option>
								))}
							</Select>
								<Row $gap={12}>
									<Stack $gap={12} style={{ flex: 1 }}>
										<Text $weight={700} $size={13}>
											Order window
										</Text>
										<Row $gap={8}>
											<Input
												type="time"
												label="Start"
												value={form.orderWindowStart}
												onChange={(e) =>
													setForm({ ...form, orderWindowStart: e.target.value })
												}
											/>
											<Input
												type="time"
												label="End"
												value={form.orderWindowEnd}
												onChange={(e) =>
													setForm({ ...form, orderWindowEnd: e.target.value })
												}
											/>
										</Row>
									</Stack>
									<Stack $gap={12} style={{ flex: 1 }}>
										<Text $weight={700} $size={13}>
											Delivery window
										</Text>
										<Row $gap={8}>
											<Input
												type="time"
												label="Start"
												value={form.deliveryWindowStart}
												onChange={(e) =>
													setForm({ ...form, deliveryWindowStart: e.target.value })
												}
											/>
											<Input
												type="time"
												label="End"
												value={form.deliveryWindowEnd}
												onChange={(e) =>
													setForm({ ...form, deliveryWindowEnd: e.target.value })
												}
											/>
										</Row>
									</Stack>
								</Row>
								<Row $gap={12}>
									<Input
										label="Capacity"
										type="number"
										min={1}
										value={String(form.capacity)}
										onChange={(e) =>
											setForm({ ...form, capacity: Number(e.target.value) })
										}
										style={{ width: 160 }}
									/>
									<label
										style={{
											display: "inline-flex",
											alignItems: "center",
											gap: 8,
											cursor: "pointer",
											marginTop: 18,
										}}
									>
										<input
											type="checkbox"
											checked={form.active}
											onChange={(e) =>
												setForm({ ...form, active: e.target.checked })
											}
										/>
										<Text $size={14}>Active</Text>
									</label>
								</Row>
								<Row $gap={12}>
									<Button type="submit" disabled={saving}>
										{editingId ? "Save changes" : "Create window"}
									</Button>
									{editingId && (
										<Button type="button" $variant="secondary" onClick={cancelEdit}>
											Cancel
										</Button>
									)}
								</Row>
							</Stack>
						</form>
					</Stack>
				</Card>

				<Stack $gap={12}>
					<Text $weight={700} $size={18}>
						Your windows
					</Text>
					{windows.length === 0 ? (
						<EmptyState
							title="No delivery windows"
							description="Create one above to define when buyers can order and receive delivery."
						/>
					) : (
						windows.map((w) => (
							<DayCard key={w.id}>
								<Row $justify="space-between" $align="center">
									<Stack $gap={4}>
										<Text $weight={700} $size={15}>
											{w.name}
										</Text>
								<Row $gap={8}>
									<Badge $tone={w.active ? "success" : "muted"}>
										{w.active ? "Active" : "Inactive"}
									</Badge>
									<Badge>{w.mealTime}</Badge>
								</Row>
										<Text $muted $size={13}>
											Order {w.orderWindowStart} – {w.orderWindowEnd}
										</Text>
										<Text $muted $size={13}>
											Delivery {w.deliveryWindowStart} – {w.deliveryWindowEnd}
										</Text>
										<Text $muted $size={13}>
											Capacity {w.capacity}
										</Text>
									</Stack>
									<Row $gap={8}>
										<Button
											$variant="secondary"
											onClick={() => startEdit(w)}
											disabled={busy}
										>
											Edit
										</Button>
										<Button
											$variant="danger"
											onClick={() => remove(w.id)}
											disabled={busy}
										>
											Remove
										</Button>
									</Row>
								</Row>
							</DayCard>
						))
					)}
				</Stack>
			</Stack>
		</FadeIn>
	);
}
