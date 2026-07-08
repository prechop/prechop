"use client";

import { useState } from "react";
import styled from "styled-components";
import useSWR from "swr";
import {
	Badge,
	Card,
	EmptyState,
	FadeIn,
	PageHeader,
	Row,
	Select,
	Stack,
	Text,
} from "@/components";
import { PageLoader } from "@/components/Loader";
import { api } from "@/constants/api";
import { fetcher } from "@/constants/fetcher";
import { useToast } from "@/hooks/useToast";
import type { MenuItem } from "@/types";

interface TimetableEntry {
	id: string;
	menuItemId: string;
	dayOfWeek: string;
	isOpen: boolean;
}

const DAYS = [
	{ value: "MONDAY", label: "Monday" },
	{ value: "TUESDAY", label: "Tuesday" },
	{ value: "WEDNESDAY", label: "Wednesday" },
	{ value: "THURSDAY", label: "Thursday" },
	{ value: "FRIDAY", label: "Friday" },
	{ value: "SATURDAY", label: "Saturday" },
	{ value: "SUNDAY", label: "Sunday" },
];

const DayCard = styled(Card)`
	padding: var(--pc-space-4) var(--pc-space-5);
`;
const DayHead = styled(Row)`
	padding-bottom: var(--pc-space-2);
`;
const DayName = styled.span`
	font-family: var(--pc-font-display);
	font-size: 17px;
	font-weight: 700;
	letter-spacing: -0.02em;
	color: var(--pc-text);
`;
const EntryRow = styled(Row)`
	padding: 10px 0;
	border-top: 1px solid var(--pc-border);
`;
const Toggle = styled.button<{ $on: boolean }>`
	position: relative;
	width: 44px;
	height: 26px;
	border-radius: 999px;
	border: none;
	cursor: pointer;
	flex-shrink: 0;
	background: ${(p) =>
		p.$on ? "var(--pc-color-accent)" : "var(--pc-surface-3)"};
	transition: background var(--pc-dur) var(--pc-ease);
	&::after {
		content: "";
		position: absolute;
		top: 3px;
		left: ${(p) => (p.$on ? "21px" : "3px")};
		width: 20px;
		height: 20px;
		border-radius: 999px;
		background: #fff;
		box-shadow: var(--pc-shadow);
		transition: left 0.15s ease;
	}
`;
const RemoveBtn = styled.button`
	all: unset;
	cursor: pointer;
	font-size: 13px;
	font-weight: 600;
	color: var(--pc-color-danger);
`;
const AddSelect = styled(Select)`
	margin-top: var(--pc-space-3);
`;

function errMsg(e: unknown): string {
	const m = (e as { response?: { data?: { message?: string } } })?.response
		?.data?.message;
	return m ?? "Something went wrong. Please try again.";
}

export default function TimetableWrapper() {
	const { toast } = useToast();
	const {
		data: entries,
		isLoading,
		mutate,
	} = useSWR<TimetableEntry[]>("/timetable", fetcher);
	const { data: menu, isLoading: menuLoading } = useSWR<MenuItem[]>(
		"/menu",
		fetcher,
	);
	const [busy, setBusy] = useState(false);

	if (isLoading || menuLoading) return <PageLoader />;

	const menuItems = menu ?? [];
	const nameById = new Map(menuItems.map((m) => [m.id, m.name]));
	const all = entries ?? [];

	async function upsert(
		menuItemId: string,
		dayOfWeek: string,
		isOpen: boolean,
	) {
		setBusy(true);
		try {
			await api.put("/timetable/entry", {
				menuItemId,
				dayOfWeek,
				isOpen,
			});
			await mutate();
		} catch (e) {
			toast(errMsg(e), "error");
		} finally {
			setBusy(false);
		}
	}

	async function removeEntry(id: string) {
		setBusy(true);
		try {
			await api.delete("/timetable/entry", { data: { id } });
			await mutate();
		} catch (e) {
			toast(errMsg(e), "error");
		} finally {
			setBusy(false);
		}
	}

	if (menuItems.length === 0) {
		return (
			<Stack $gap={16}>
				<PageHeader
					eyebrow="Schedule"
					title="Weekly timetable"
					subtitle="Plan which menu items you sell on each day of the week."
				/>
				<EmptyState
					icon="📋"
					title="Add menu items first"
					description="Build your menu, then schedule which items you sell each day."
				/>
			</Stack>
		);
	}

	return (
		<Stack $gap={16}>
			<PageHeader
				eyebrow="Schedule"
				title="Weekly timetable"
				subtitle="Schedule which menu items you sell on each day. Use these as a template when composing a daily order."
			/>

			{DAYS.map((day, i) => {
				const dayEntries = all.filter((e) => e.dayOfWeek === day.value);
				const usedIds = new Set(dayEntries.map((e) => e.menuItemId));
				const available = menuItems.filter((m) => !usedIds.has(m.id));
				return (
					<FadeIn key={day.value} $delay={i * 40}>
						<DayCard>
							<Stack $gap={0}>
								<DayHead
									$justify="space-between"
									$align="center"
								>
									<DayName>{day.label}</DayName>
									<Badge
										$tone={
											dayEntries.some((e) => e.isOpen)
												? "success"
												: "muted"
										}
									>
										{
											dayEntries.filter((e) => e.isOpen)
												.length
										}{" "}
										open
									</Badge>
								</DayHead>

								{dayEntries.map((e) => (
									<EntryRow
										key={e.id}
										$justify="space-between"
										$gap={10}
									>
										<Text $size={14}>
											{nameById.get(e.menuItemId) ??
												"Unknown item"}
										</Text>
										<Row $gap={12}>
											<Toggle
												$on={e.isOpen}
												disabled={busy}
												aria-label="Toggle open"
												onClick={() =>
													upsert(
														e.menuItemId,
														day.value,
														!e.isOpen,
													)
												}
											/>
											<RemoveBtn
												onClick={() =>
													removeEntry(e.id)
												}
											>
												Remove
											</RemoveBtn>
										</Row>
									</EntryRow>
								))}

								{available.length > 0 && (
									<AddSelect
										value=""
										disabled={busy}
										onChange={(ev) => {
											if (ev.target.value)
												upsert(
													ev.target.value,
													day.value,
													true,
												);
										}}
									>
										<option value="">
											＋ Add item to {day.label}…
										</option>
										{available.map((m) => (
											<option key={m.id} value={m.id}>
												{m.name}
											</option>
										))}
									</AddSelect>
								)}
							</Stack>
						</DayCard>
					</FadeIn>
				);
			})}
		</Stack>
	);
}
