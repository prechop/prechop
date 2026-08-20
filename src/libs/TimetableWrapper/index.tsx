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
	Title,
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
	orderStartTime?: string;
	cutoffTime?: string;
	cookingStartTime?: string;
	readyDeliveryStartTime?: string;
	plannedMenu?: string;
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
const TimeGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px;
  margin-top: 8px;
`;
const TimeField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;
const TimeLabel = styled.span`
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--pc-text-muted);
`;
const TimeInput = styled.input`
  height: 36px;
  border: 1px solid var(--pc-border);
  border-radius: var(--pc-radius-sm);
  background: var(--pc-surface);
  color: var(--pc-text);
  padding: 0 10px;
  font-size: 13px;
  font-family: inherit;
  &:focus {
    outline: none;
    border-color: var(--pc-color-primary);
  }
`;
const PlannedInput = styled.textarea`
  width: 100%;
  min-height: 60px;
  border: 1px solid var(--pc-border);
  border-radius: var(--pc-radius-sm);
  background: var(--pc-surface);
  color: var(--pc-text);
  padding: 8px 10px;
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
  margin-top: 8px;
  &:focus {
    outline: none;
    border-color: var(--pc-color-primary);
  }
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
		orderStartTime?: string,
		cutoffTime?: string,
		cookingStartTime?: string,
		readyDeliveryStartTime?: string,
		plannedMenu?: string,
	) {
		setBusy(true);
		try {
			await api.put("/timetable/entry", {
				menuItemId,
				dayOfWeek,
				isOpen,
				orderStartTime: orderStartTime || undefined,
				cutoffTime: cutoffTime || undefined,
				cookingStartTime: cookingStartTime || undefined,
				readyDeliveryStartTime: readyDeliveryStartTime || undefined,
				plannedMenu: plannedMenu?.trim() || undefined,
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
								<Card
									key={e.id}
									$pad={14}
									style={{ marginTop: 8 }}
								>
									<Stack $gap={10}>
										<Row
											$justify="space-between"
											$align="center"
										>
											<Text $weight={700} $size={14}>
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
															e.orderStartTime,
															e.cutoffTime,
															e.cookingStartTime,
															e.readyDeliveryStartTime,
															e.plannedMenu,
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
										</Row>
										<TimeGrid>
											<TimeField>
												<TimeLabel>
													Order start
												</TimeLabel>
												<TimeInput
													type="time"
													value={
														e.orderStartTime ??
														""
													}
													onChange={(ev) =>
														upsert(
															e.menuItemId,
															day.value,
															e.isOpen,
															ev.target.value ||
																undefined,
															e.cutoffTime,
															e.cookingStartTime,
															e.readyDeliveryStartTime,
															e.plannedMenu,
														)
													}
													disabled={busy}
												/>
											</TimeField>
											<TimeField>
												<TimeLabel>
													Cutoff
												</TimeLabel>
												<TimeInput
													type="time"
													value={
														e.cutoffTime ?? ""
													}
													onChange={(ev) =>
														upsert(
															e.menuItemId,
															day.value,
															e.isOpen,
															e.orderStartTime,
															ev.target.value ||
																undefined,
															e.cookingStartTime,
															e.readyDeliveryStartTime,
															e.plannedMenu,
														)
													}
													disabled={busy}
												/>
											</TimeField>
											<TimeField>
												<TimeLabel>
													Cooking start
												</TimeLabel>
												<TimeInput
													type="time"
													value={
														e.cookingStartTime ??
														""
													}
													onChange={(ev) =>
														upsert(
															e.menuItemId,
															day.value,
															e.isOpen,
															e.orderStartTime,
															e.cutoffTime,
															ev.target.value ||
																undefined,
															e.readyDeliveryStartTime,
															e.plannedMenu,
														)
													}
													disabled={busy}
												/>
											</TimeField>
											<TimeField>
												<TimeLabel>
													Ready/delivery
												</TimeLabel>
												<TimeInput
													type="time"
													value={
														e.readyDeliveryStartTime ??
														""
													}
													onChange={(ev) =>
														upsert(
															e.menuItemId,
															day.value,
															e.isOpen,
															e.orderStartTime,
															e.cutoffTime,
															e.cookingStartTime,
															ev.target.value ||
																undefined,
															e.plannedMenu,
														)
													}
													disabled={busy}
												/>
											</TimeField>
										</TimeGrid>
										<PlannedInput
											placeholder="Planned menu description (optional)"
											value={e.plannedMenu ?? ""}
											onChange={(ev) =>
												upsert(
													e.menuItemId,
													day.value,
													e.isOpen,
													e.orderStartTime,
													e.cutoffTime,
													e.cookingStartTime,
													e.readyDeliveryStartTime,
													ev.target.value,
												)
											}
											disabled={busy}
										/>
									</Stack>
								</Card>
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
