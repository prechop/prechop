"use client";

import Link from "next/link";
import { useState } from "react";
import styled, { keyframes } from "styled-components";
import useSWR from "swr";
import {
	Badge,
	Card,
	EmptyState,
	FadeIn,
	Grid,
	PageHeader,
	Row,
	SectionHeader,
	Skeleton,
	Stack,
	StatCard,
	Text,
	Title,
} from "@/components";
import { PageLoader } from "@/components/Loader";
import { api } from "@/constants/api";
import { fetcher } from "@/constants/fetcher";
import {
	formatDate,
	formatKobo,
	statusLabel,
	timeUntil,
} from "@/constants/formatters";
import { useToast } from "@/hooks/useToast";
import VendorOnboardingWrapper, {
	type VendorMe,
} from "@/libs/VendorOnboardingWrapper";
import type { DailyOrder, OrderStatus } from "@/types";

interface IncomingOrder {
	id: string;
	orderNumber: string;
	status: OrderStatus;
	fulfillmentType: "PICKUP" | "DELIVERY";
	totalKobo: number;
	createdAt?: string;
	items: Array<{ snapshotName: string; quantity: number }>;
}

const OpenCard = styled(Card)`
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--pc-space-4);
	background: var(--pc-gradient-warm);
	border: none;
	color: var(--pc-text-inverse);
	box-shadow: var(--pc-shadow-primary);
	position: relative;
	overflow: hidden;
	&::after {
		content: "";
		position: absolute;
		right: -30px;
		top: -30px;
		width: 140px;
		height: 140px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.12);
	}
`;
const OpenText = styled.div`
	position: relative;
	display: flex;
	flex-direction: column;
	gap: 4px;
`;
const OpenTitle = styled.span`
	font-family: var(--pc-font-display);
	font-size: 19px;
	font-weight: 800;
	letter-spacing: -0.02em;
	color: #fff;
`;
const OpenSub = styled.span`
	font-size: 13.5px;
	font-weight: 600;
	color: rgba(255, 255, 255, 0.88);
`;
const NewButton = styled(Link)`
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 10px;
	width: 100%;
	padding: 16px;
	border-radius: var(--pc-radius);
	background: var(--pc-color-primary);
	color: var(--pc-text-inverse);
	font-family: var(--pc-font-display);
	font-weight: 800;
	font-size: 16px;
	letter-spacing: -0.01em;
	box-shadow: var(--pc-shadow-primary);
	transition: transform var(--pc-dur) var(--pc-ease),
		background var(--pc-dur) var(--pc-ease);
	&:hover {
		background: var(--pc-color-primary-600);
		transform: translateY(-2px);
	}
`;
const OrderCard = styled(Card)`
	display: block;
	color: inherit;
	&:hover {
		box-shadow: var(--pc-shadow-lg);
		transform: translateY(-3px);
		border-color: var(--pc-surface-3);
	}
`;
const CookLink = styled(Link)`
	display: inline-flex;
	align-items: center;
	gap: 4px;
	color: var(--pc-color-primary);
	font-weight: 800;
	font-size: 14px;
`;
const IncomingItem = styled.div`
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	padding: 11px 0;
	border-bottom: 1px solid var(--pc-border);
	&:last-child {
		border-bottom: none;
	}
`;
const pulse = keyframes`
	0%, 100% { opacity: 1; transform: scale(1); }
	50% { opacity: 0.4; transform: scale(0.7); }
`;
const LivePulse = styled.span`
	display: inline-flex;
	align-items: center;
	gap: 6px;
	font-size: 12px;
	font-weight: 700;
	color: var(--pc-color-accent);
	&::before {
		content: "";
		width: 8px;
		height: 8px;
		border-radius: 999px;
		background: var(--pc-color-accent);
		animation: ${pulse} 1.6s ease-in-out infinite;
	}
`;
const Toggle = styled.button<{ $on: boolean }>`
	position: relative;
	width: 56px;
	height: 32px;
	border-radius: 999px;
	border: 2px solid rgba(255, 255, 255, 0.55);
	cursor: pointer;
	flex-shrink: 0;
	background: ${(p) =>
		p.$on ? "rgba(255, 255, 255, 0.92)" : "rgba(0, 0, 0, 0.18)"};
	transition: background var(--pc-dur) var(--pc-ease);
	&::after {
		content: "";
		position: absolute;
		top: 3px;
		left: ${(p) => (p.$on ? "27px" : "3px")};
		width: 22px;
		height: 22px;
		border-radius: 999px;
		background: ${(p) => (p.$on ? "var(--pc-color-accent)" : "#fff")};
		box-shadow: var(--pc-shadow);
		transition: left var(--pc-dur) var(--pc-ease),
			background var(--pc-dur) var(--pc-ease);
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

function orderTone(
	s: OrderStatus,
): "primary" | "success" | "warning" | "danger" | "muted" {
	switch (s) {
		case "PAID":
			return "warning";
		case "READY":
		case "COMPLETED":
			return "success";
		case "CANCELLED":
		case "REFUNDED":
			return "danger";
		default:
			return "primary";
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
		// Poll so newly-placed/paid orders and counts stay live (#17).
		{ refreshInterval: 15_000 },
	);

	// Live incoming buyer orders for the vendor's current active daily order.
	const activeDailyId =
		orders?.find((o) => o.status === "ACTIVE")?.id ?? null;
	const { data: incoming } = useSWR<IncomingOrder[]>(
		activeDailyId ? `/vendor/daily-orders/${activeDailyId}/orders` : null,
		fetcher,
		{ refreshInterval: 15_000 },
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
	const activeCount = list.filter((o) => o.status === "ACTIVE").length;
	const ordersPlaced = list.reduce(
		(sum, o) => sum + (o.totalOrdersCount ?? 0),
		0,
	);

	return (
		<FadeIn>
			<Stack $gap={20}>
				<PageHeader
					eyebrow="Vendor dashboard"
					title={vendor.businessName ?? "Your kitchen"}
					subtitle={
						vendor.isOpenForOrders
							? "You're open — buyers can order from you right now."
							: "You're currently closed for new orders."
					}
				/>

				<OpenCard>
					<OpenText>
						<OpenTitle>
							{vendor.isOpenForOrders
								? "Open for orders"
								: "Closed"}
						</OpenTitle>
						<OpenSub>
							{vendor.isOpenForOrders
								? "Buyers can order from you"
								: "You're not accepting orders"}
						</OpenSub>
					</OpenText>
					<Toggle
						$on={vendor.isOpenForOrders}
						onClick={toggleOpen}
						disabled={toggling}
						aria-label="Toggle open for orders"
					/>
				</OpenCard>

				<Grid $min={150} $gap={12}>
					<StatCard
						label="Daily orders"
						value={list.length}
						icon="🍲"
						hint="Posted this period"
					/>
					<StatCard
						label="Live now"
						value={activeCount}
						icon="🔥"
						tone="var(--pc-color-accent)"
						hint="Active daily orders"
					/>
					<StatCard
						label="Orders placed"
						value={ordersPlaced}
						icon="🧾"
						tone="var(--pc-color-gold)"
						hint="Across all your posts"
					/>
				</Grid>

				<NewButton href="/dashboard/new">
					<span aria-hidden>＋</span> New daily order
				</NewButton>

				{activeDailyId && (incoming?.length ?? 0) > 0 && (
					<Card>
						<SectionHeader
							title="Incoming orders"
							icon="🔔"
							action={<LivePulse>Live</LivePulse>}
						/>
						<div>
							{(incoming ?? []).slice(0, 6).map((o) => (
								<IncomingItem key={o.id}>
									<Stack $gap={3}>
										<Row $gap={8} $align="center">
											<Text $weight={700} $size={14}>
												#{o.orderNumber}
											</Text>
											<Badge $tone={orderTone(o.status)}>
												{statusLabel(o.status)}
											</Badge>
										</Row>
										<Text $muted $size={12}>
											{o.fulfillmentType === "DELIVERY"
												? "🛵 Delivery"
												: "🥡 Pickup"}{" "}
											·{" "}
											{o.items.reduce(
												(n, it) => n + it.quantity,
												0,
											)}{" "}
											item(s)
										</Text>
									</Stack>
									<Text $weight={800} $size={14}>
										{formatKobo(o.totalKobo)}
									</Text>
								</IncomingItem>
							))}
						</div>
						<Row $justify="flex-end" style={{ marginTop: 12 }}>
							<CookLink href="/pipeline">
								Open kitchen <span aria-hidden>→</span>
							</CookLink>
						</Row>
					</Card>
				)}

				<div>
					<SectionHeader title="Today's orders" icon="📋" />

					{ordersLoading ? (
						<Stack $gap={12}>
							{[0, 1, 2].map((i) => (
								<Card key={i}>
									<Stack $gap={10}>
										<Skeleton $w="55%" $h={20} />
										<Skeleton $w="80%" $h={14} />
										<Skeleton $w="40%" $h={14} />
									</Stack>
								</Card>
							))}
						</Stack>
					) : list.length === 0 ? (
						<EmptyState
							icon="🍲"
							title="No daily orders yet"
							description="Post your first daily order to start selling today."
						/>
					) : (
						<Stack $gap={12}>
							{list.map((o, i) => {
								const closed =
									timeUntil(o.cutoffTime) === "closed";
								const comingSoon = o.availableFrom
									? new Date(o.availableFrom).getTime() >
										Date.now()
									: false;
								return (
									<FadeIn key={o.id} $delay={i * 40}>
										<OrderCard>
											<Stack $gap={12}>
												<Row
													$justify="space-between"
													$align="flex-start"
													$gap={8}
												>
													<Title $size={17}>
														{o.title}
													</Title>
													<Badge
														$tone={statusTone(
															o.status,
														)}
													>
														{statusLabel(o.status)}
													</Badge>
												</Row>
												<Row
													$justify="space-between"
													$align="center"
													$wrap
													$gap={8}
												>
													<Text $muted $size={13}>
														{formatDate(
															o.scheduledDate,
														)}{" "}
														· {o.items.length} item
														{o.items.length === 1
															? ""
															: "s"}
													</Text>
													<Badge
														$tone={
															o.status !==
															"ACTIVE"
																? "muted"
																: comingSoon
																	? "primary"
																	: closed
																		? "danger"
																		: "warning"
														}
													>
														{o.status !== "ACTIVE"
															? statusLabel(
																	o.status,
																)
															: comingSoon
																? `🔜 ${formatDate(o.availableFrom as string)}`
																: closed
																	? "Cutoff passed"
																	: timeUntil(
																			o.cutoffTime,
																		)}
													</Badge>
												</Row>
												<Row
													$justify="space-between"
													$align="center"
													$gap={8}
												>
													<Text
														$size={13}
														$weight={700}
													>
														{o.totalOrdersCount}{" "}
														order
														{o.totalOrdersCount ===
														1
															? ""
															: "s"}{" "}
														placed
													</Text>
													<CookLink href="/pipeline">
														Cooking{" "}
														<span aria-hidden>
															→
														</span>
													</CookLink>
												</Row>
											</Stack>
										</OrderCard>
									</FadeIn>
								);
							})}
						</Stack>
					)}
				</div>
			</Stack>
		</FadeIn>
	);
}
