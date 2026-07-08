"use client";

import Link from "next/link";
import { useState } from "react";
import styled from "styled-components";
import useSWR from "swr";
import { Badge, Card, Row, Stack, Text, Title } from "@/components";
import { PageLoader } from "@/components/Loader";
import { api } from "@/constants/api";
import { fetcher } from "@/constants/fetcher";
import { formatDate, statusLabel, timeUntil } from "@/constants/formatters";
import { useToast } from "@/hooks/useToast";
import VendorOnboardingWrapper, {
	type VendorMe,
} from "@/libs/VendorOnboardingWrapper";
import type { DailyOrder } from "@/types";

const Header = styled(Row)`
	margin-bottom: var(--pc-space-5);
`;
const OpenCard = styled(Card)`
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
`;
const NewButton = styled(Link)`
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	width: 100%;
	padding: 14px;
	border-radius: var(--pc-radius-sm);
	background: var(--pc-color-primary);
	color: var(--pc-text-inverse);
	font-weight: 700;
	font-size: 16px;
	&:hover {
		background: var(--pc-color-primary-600);
	}
`;
const OrderCard = styled(Card)`
	display: block;
	color: inherit;
	transition: box-shadow 0.15s ease;
	&:hover {
		box-shadow: var(--pc-shadow-lg);
	}
`;
const Empty = styled(Card)`
	text-align: center;
	padding: var(--pc-space-8) var(--pc-space-5);
`;
const Toggle = styled.button<{ $on: boolean }>`
	position: relative;
	width: 52px;
	height: 30px;
	border-radius: 999px;
	border: none;
	cursor: pointer;
	flex-shrink: 0;
	background: ${(p) =>
		p.$on ? "var(--pc-color-success)" : "var(--pc-surface-2)"};
	transition: background 0.15s ease;
	&::after {
		content: "";
		position: absolute;
		top: 3px;
		left: ${(p) => (p.$on ? "25px" : "3px")};
		width: 24px;
		height: 24px;
		border-radius: 999px;
		background: #fff;
		box-shadow: var(--pc-shadow);
		transition: left 0.15s ease;
	}
`;

function statusTone(
	s: DailyOrder["status"],
): "primary" | "success" | "warning" | "danger" | "muted" {
	switch (s) {
		case "ACTIVE":
			return "success";
		case "DRAFT":
			return "warning";
		case "CANCELLED":
			return "danger";
		default:
			return "muted";
	}
}

function errMsg(e: unknown): string {
	const m = (e as { response?: { data?: { message?: string } } })?.response
		?.data?.message;
	return m ?? "Something went wrong. Please try again.";
}

export default function VendorDashboardWrapper() {
	const { toast } = useToast();
	const {
		data: vendor,
		isLoading,
		mutate: mutateVendor,
	} = useSWR<VendorMe>("/vendors/me", fetcher);

	const isActive =
		vendor?.status === "ACTIVE" &&
		(vendor?.profileCompleteness ?? 0) >= 100;

	const { data: orders, isLoading: ordersLoading } = useSWR<DailyOrder[]>(
		isActive ? "/daily-orders/my-orders?limit=50" : null,
		fetcher,
	);

	const [toggling, setToggling] = useState(false);

	if (isLoading || !vendor) return <PageLoader />;

	if (!isActive) {
		return (
			<VendorOnboardingWrapper
				vendor={vendor}
				onChanged={() => mutateVendor()}
			/>
		);
	}

	async function toggleOpen() {
		if (!vendor) return;
		setToggling(true);
		try {
			await api.patch("/vendors/me/open-status", {
				isOpenForOrders: !vendor.isOpenForOrders,
			});
			await mutateVendor();
		} catch (e) {
			toast(errMsg(e), "error");
		} finally {
			setToggling(false);
		}
	}

	const list = orders ?? [];

	return (
		<Stack $gap={16}>
			<Header $justify="space-between" $align="flex-start">
				<Stack $gap={2}>
					<Title $size={24}>
						{vendor.businessName ?? "Your kitchen"}
					</Title>
					<Text $muted $size={13}>
						{list.length} daily order{list.length === 1 ? "" : "s"}
					</Text>
				</Stack>
			</Header>

			<OpenCard>
				<Stack $gap={2}>
					<Text $weight={700}>
						{vendor.isOpenForOrders ? "Open for orders" : "Closed"}
					</Text>
					<Text $muted $size={13}>
						{vendor.isOpenForOrders
							? "Buyers can order from you"
							: "You're not accepting orders"}
					</Text>
				</Stack>
				<Toggle
					$on={vendor.isOpenForOrders}
					onClick={toggleOpen}
					disabled={toggling}
					aria-label="Toggle open for orders"
				/>
			</OpenCard>

			<NewButton href="/dashboard/new">＋ New daily order</NewButton>

			<Stack $gap={4}>
				<Title $size={17}>Today&apos;s orders</Title>
			</Stack>

			{ordersLoading ? (
				<PageLoader />
			) : list.length === 0 ? (
				<Empty>
					<Stack $gap={6}>
						<Text $weight={700} $size={16}>
							No daily orders yet
						</Text>
						<Text $muted>
							Post your first daily order to start selling today.
						</Text>
					</Stack>
				</Empty>
			) : (
				<Stack $gap={12}>
					{list.map((o) => {
						const closed = timeUntil(o.cutoffTime) === "closed";
						return (
							<OrderCard key={o.id}>
								<Stack $gap={10}>
									<Row
										$justify="space-between"
										$align="flex-start"
										$gap={8}
									>
										<Title $size={17}>{o.title}</Title>
										<Badge $tone={statusTone(o.status)}>
											{statusLabel(o.status)}
										</Badge>
									</Row>
									<Row
										$justify="space-between"
										$align="center"
										$wrap
									>
										<Text $muted $size={13}>
											{formatDate(o.scheduledDate)} ·{" "}
											{o.items.length} item
											{o.items.length === 1 ? "" : "s"}
										</Text>
										<Badge
											$tone={
												o.status === "ACTIVE"
													? closed
														? "danger"
														: "warning"
													: "muted"
											}
										>
											{o.status === "ACTIVE"
												? closed
													? "Cutoff passed"
													: timeUntil(o.cutoffTime)
												: statusLabel(o.status)}
										</Badge>
									</Row>
									<Row
										$justify="space-between"
										$align="center"
									>
										<Text $size={13} $weight={600}>
											{o.totalOrdersCount} order
											{o.totalOrdersCount === 1
												? ""
												: "s"}{" "}
											placed
										</Text>
										<Link
											href="/pipeline"
											style={{
												color: "var(--pc-color-primary)",
												fontWeight: 700,
												fontSize: 14,
											}}
										>
											Cooking →
										</Link>
									</Row>
								</Stack>
							</OrderCard>
						);
					})}
				</Stack>
			)}
		</Stack>
	);
}
