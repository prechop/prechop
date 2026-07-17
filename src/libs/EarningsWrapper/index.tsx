"use client";

/**
 * Vendor earnings — PRD §8.8.
 *
 * What this page must never do again: it used to read `/vendor/analytics` and
 * label `totalRevenueKobo` "Total revenue" on a page called Earnings. Revenue
 * is not earnings — PreChop's per-order fee comes out of it — so every vendor
 * was shown a number bigger than the money they actually received, with no fee
 * line anywhere to explain the gap.
 *
 * The money model, and why the UI looks like this:
 *  - Paystack splits each payment at the source via subaccounts and settles the
 *    vendor DIRECTLY. PreChop never takes custody of vendor money.
 *  - So there is NO pending payout balance to show, and NO "paid on {date}".
 *    We don't integrate Paystack's settlements API, so both would be invented.
 *    An honest gap beats a confident lie about someone's income.
 */

import Link from "next/link";
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
	PageHeader,
	Row,
	SectionHeader,
	Stack,
	StatCard,
	Text,
} from "@/components";
import { fetcher } from "@/constants/fetcher";
import { formatDate, formatDateTime, formatKobo } from "@/constants/formatters";

/* ------------------------------------------------------------------ contract */

interface EarningsDay {
	date: string;
	grossKobo: number;
	platformFeeKobo: number;
	netSettledKobo: number;
	orders: number;
}

interface Earnings {
	/** False ⇒ no Paystack subaccount ⇒ the server REJECTS orders to this
	 *  vendor. Outranks every other state; see NoBank below. */
	bankConnected: boolean;
	/** The commission rate `placeOrder` ACTUALLY applied, straight from the
	 *  server's effective (admin-governed) policy. This is the only vendor fee
	 *  figure that is true, so it is the only one we show. Never hardcode 8
	 *  against it.
	 *
	 *  The retired flat `platformFeeVendorKobo` field is deliberately absent:
	 *  it was pinned at 0 and nothing in the pricing path read it, so rendering
	 *  it as "₦0.00 per order" told a vendor their commission was nothing while
	 *  a real percentage was being deducted. The server no longer sends it. */
	platformFeeVendorPercent: number;
	totals: {
		grossKobo: number;
		platformFeeKobo: number;
		netSettledKobo: number;
		orders: number;
	};
	days: EarningsDay[];
}

/** Reviews still come from analytics — this is the only vendor-facing surface
 *  for them, so it stays even though it isn't money. */
interface Analytics {
	reviews: Array<{
		id: string;
		buyerName?: string;
		rating: number;
		comment?: string;
		createdAt: string;
	}>;
}

/**
 * These keys are the SERVER's vocabulary, verbatim — `earningsQuerySchema` in
 * `server/validators/vendors/validate.ts` is `zod.enum(["today","week","month",
 * "all"])` and rejects anything else outright (no fallback). The UI used to send
 * `7d|30d|90d|all`, which every request 400'd on; the error state then read as
 * "we couldn't load your earnings" forever. There is deliberately no 90-day
 * option: the server has no such range, so offering one would either 400 or
 * quietly show a 30-day figure under a 90-day label.
 *
 * Labels are what the server actually computes — `week` is the last 7 Lagos
 * days inclusive of today, `month` the last 30 — not "this calendar week".
 */
const RANGES = [
	{ key: "today", label: "Today" },
	{ key: "week", label: "7 days" },
	{ key: "month", label: "30 days" },
	{ key: "all", label: "All time" },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

/* -------------------------------------------------------------------- styles */

const DayCard = styled(Card)`
	padding: var(--pc-space-4);
	border-left: 3px solid var(--pc-color-accent);
	&:hover {
		box-shadow: var(--pc-shadow);
	}
`;
const Amount = styled.div`
	font-family: var(--pc-font-display);
	font-size: 18px;
	font-weight: 800;
	letter-spacing: -0.02em;
	color: var(--pc-text);
`;
const Notice = styled(Card)`
	border-left: 3px solid var(--pc-color-accent);
	background: var(--pc-color-accent-50);
`;
const RangeBar = styled(Row)`
	flex-wrap: wrap;
`;
const RangeBtn = styled.button<{ $active: boolean }>`
	border: 1px solid
		${(p) => (p.$active ? "var(--pc-color-primary)" : "var(--pc-border)")};
	background: ${(p) =>
		p.$active ? "var(--pc-color-primary-50)" : "var(--pc-surface)"};
	color: ${(p) =>
		p.$active ? "var(--pc-color-primary-ink)" : "var(--pc-text-muted)"};
	font-weight: 700;
	font-size: 13px;
	padding: 7px 14px;
	border-radius: var(--pc-radius-pill);
	cursor: pointer;
	transition: all var(--pc-dur) var(--pc-ease);
	&:focus-visible {
		outline: 2px solid var(--pc-color-primary);
		outline-offset: 2px;
	}
`;
const Skel = styled.div<{ $h?: number; $w?: string }>`
	height: ${(p) => p.$h ?? 14}px;
	width: ${(p) => p.$w ?? "100%"};
	border-radius: 8px;
	background: var(--pc-surface-2);
`;
const EarningsStatsGrid = styled(Grid)`
	@media (max-width: 520px) {
		gap: 10px;

		> div {
			min-width: 0;
			padding: 16px 14px;
			gap: 7px;
		}

		> div > div:first-child {
			min-width: 0;
			gap: 8px;
		}

		> div > div:first-child > span:first-child {
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			font-size: 13px;
			line-height: 1.15;
		}

		> div > div:first-child > span:last-child {
			flex: 0 0 auto;
			font-size: 17px;
		}

		> div > div:nth-child(2) {
			min-width: 0;
			overflow-wrap: anywhere;
			font-size: 26px;
			letter-spacing: 0;
			line-height: 1.05;
		}

		> div > span {
			font-size: 12.5px;
			line-height: 1.25;
		}
	}

	@media (max-width: 360px) {
		> div {
			padding: 14px 12px;
		}

		> div > div:nth-child(2) {
			font-size: 24px;
		}
	}
`;

/* -------------------------------------------------------------------- pieces */

/**
 * Pinned above the stats, always — not a dismissible tip. It answers the first
 * question a vendor has ("where is my money?") before they can misread the
 * numbers as a balance PreChop is holding for them.
 */
function SettlementNotice() {
	return (
		<Notice>
			<Row $gap={12} $align="flex-start">
				<Text $size={20} aria-hidden>
					🏦
				</Text>
				<Stack $gap={4}>
					<Text $weight={800} $size={15}>
						Paystack pays you directly. PreChop never holds your
						money.
					</Text>
					<Text $muted $size={13.5}>
						Every payment is split at checkout and your share is
						settled straight to your bank account by Paystack. There
						is no balance here to withdraw.
					</Text>
				</Stack>
			</Row>
		</Notice>
	);
}

/** Skeleton grid — deliberately NOT <PageLoader>, which collapses the layout to
 *  a spinner and makes a slow campus network feel like a broken page. */
function EarningsSkeleton() {
	return (
		<Stack $gap={20}>
			<PageHeader
				eyebrow="Vendor · Money"
				title="Earnings"
				subtitle="What you sold, what PreChop charged, and what Paystack sent to your bank."
			/>
			<Card>
				<Row $gap={12} $align="flex-start">
					<Skel $h={20} $w="20px" />
					<Stack $gap={6} style={{ flex: 1 }}>
						<Skel $h={16} $w="70%" />
						<Skel $h={12} $w="90%" />
					</Stack>
				</Row>
			</Card>
			<Grid $min={160} $gap={12} aria-hidden>
				{[0, 1, 2, 3].map((n) => (
					<Card key={n}>
						<Stack $gap={10}>
							<Skel $h={13} $w="55%" />
							<Skel $h={30} $w="75%" />
							<Skel $h={12} $w="45%" />
						</Stack>
					</Card>
				))}
			</Grid>
			<Stack $gap={10}>
				{[0, 1, 2].map((n) => (
					<Card key={n}>
						<Row $justify="space-between">
							<Skel $h={16} $w="120px" />
							<Skel $h={16} $w="80px" />
						</Row>
					</Card>
				))}
			</Stack>
		</Stack>
	);
}

/**
 * The no-bank state. This is a genuinely invisible failure today: `placeOrder`
 * hard-rejects every order when the vendor has no `paystackSubaccountCode`, and
 * the vendor is never told — their kitchen simply takes no orders, forever.
 * It outranks "empty" because zero earnings is the SYMPTOM, not the problem.
 */
function NoBank() {
	return (
		<Card $accent>
			<Stack $gap={12}>
				<Row $gap={10} $align="center">
					<Text $size={22} aria-hidden>
						⚠️
					</Text>
					<Text $weight={800} $size={17}>
						Connect your bank to get paid
					</Text>
				</Row>
				<Text $muted $size={14}>
					Your payout account isn't set up yet, so PreChop can't take
					orders for your kitchen — buyers are turned away at
					checkout. Add your bank details and Paystack will start
					settling you directly.
				</Text>
				<Row>
					<Button as={Link} href="/vendor/settings" $pill>
						Add bank details →
					</Button>
				</Row>
			</Stack>
		</Card>
	);
}

/* --------------------------------------------------------------------- page */

export default function EarningsWrapper() {
	const [range, setRange] = useState<RangeKey>("month");
	// `/vendors/me/earnings`, NOT `/vendor/earnings` — the vendor is resolved
	// from the session (there is no vendorId to tamper with), and the route
	// follows the existing `vendors/me/*` convention. The old path 404'd.
	const { data, isLoading, error } = useSWR<Earnings>(
		`/vendors/me/earnings?range=${range}`,
		fetcher,
	);
	const { data: analytics } = useSWR<Analytics>("/vendor/analytics", fetcher);

	if (isLoading) return <EarningsSkeleton />;

	// A failed fetch must never read as "you earned nothing".
	if (error || !data) {
		return (
			<Stack $gap={20}>
				<PageHeader eyebrow="Vendor · Money" title="Earnings" />
				<EmptyState
					icon="📡"
					title="We couldn't load your earnings"
					description="Your money is safe — this is a display problem. Check your connection and try again."
					action={
						<Button $pill onClick={() => window.location.reload()}>
							Retry
						</Button>
					}
				/>
			</Stack>
		);
	}

	const { totals, days, platformFeeVendorPercent, bankConnected } = data;
	const reviews = analytics?.reviews ?? [];
	const sortedDays = [...(days ?? [])].sort(
		(a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
	);

	return (
		<FadeIn>
			<Stack $gap={20}>
				<PageHeader
					eyebrow="Vendor · Money"
					title="Earnings"
					subtitle="What you sold, what PreChop charged, and what Paystack sent to your bank."
				/>

				<SettlementNotice />

				{/* Outranks the empty state: no bank is why there are no earnings. */}
				{!bankConnected && <NoBank />}

				<RangeBar
					$gap={8}
					role="group"
					aria-label="Earnings date range"
				>
					{RANGES.map((r) => (
						<RangeBtn
							key={r.key}
							type="button"
							$active={range === r.key}
							aria-pressed={range === r.key}
							onClick={() => setRange(r.key)}
						>
							{r.label}
						</RangeBtn>
					))}
				</RangeBar>

				<EarningsStatsGrid $min={160} $gap={12}>
					<StatCard
						label="Gross sales"
						value={formatKobo(totals.grossKobo)}
						icon="🍲"
						tone="var(--pc-color-primary)"
						hint="What buyers paid for your food"
					/>
					<StatCard
						label="PreChop fee"
						value={`−${formatKobo(totals.platformFeeKobo)}`}
						icon="%"
						tone="var(--pc-color-danger)"
						// The rate is the server's EFFECTIVE policy — the same
						// number placeOrder charged — never a hardcoded ₦100 or
						// "8%". The retired flat kobo field is not rendered (nor
						// sent any more): pinned at 0, it read "₦0 per order" on
						// a card whose own value shows a real deduction.
						hint={
							typeof platformFeeVendorPercent === "number"
								? `${platformFeeVendorPercent}% of food subtotal`
								: "Deducted per order"
						}
					/>
					<StatCard
						label="Net settled"
						value={formatKobo(totals.netSettledKobo)}
						icon="🏦"
						tone="var(--pc-color-accent)"
						hint="Sent to your bank by Paystack"
					/>
					<StatCard
						label="Orders"
						value={totals.orders}
						icon="🧾"
						tone="var(--pc-color-gold)"
						hint="Completed paid orders"
					/>
				</EarningsStatsGrid>

				<SectionHeader title="Daily breakdown" icon="📅" />
				{sortedDays.length === 0 ? (
					<EmptyState
						icon="💸"
						title="No earnings yet"
						description={
							bankConnected
								? "Once buyers start ordering, every day you sell will show up here with its fee and payout."
								: "Add your bank details above so buyers can order and Paystack can settle you."
						}
					/>
				) : (
					<Stack $gap={10}>
						{sortedDays.map((d) => (
							<DayCard key={d.date}>
								<Row
									$justify="space-between"
									$align="center"
									$gap={12}
								>
									<Stack $gap={6}>
										<Text $weight={700}>
											{formatDate(d.date)}
										</Text>
										<Row $gap={6} $wrap>
											{/* A zero-order day is stated, not hidden —
											    a missing row reads as a bug. */}
											<Badge
												$tone={
													d.orders > 0
														? "success"
														: "muted"
												}
											>
												{d.orders} order
												{d.orders === 1 ? "" : "s"}
											</Badge>
											<Badge $tone="muted">
												Fee −
												{formatKobo(d.platformFeeKobo)}
											</Badge>
										</Row>
									</Stack>
									<Stack
										$gap={2}
										style={{ textAlign: "right" }}
									>
										<Amount>
											{formatKobo(d.netSettledKobo)}
										</Amount>
										<Text $muted $size={12}>
											Net settled
										</Text>
										<Text $muted $size={12}>
											Gross {formatKobo(d.grossKobo)}
										</Text>
									</Stack>
								</Row>
							</DayCard>
						))}
					</Stack>
				)}

				<SectionHeader title="Customer reviews" icon="★" />
				{reviews.length === 0 ? (
					<EmptyState
						icon="★"
						title="No customer reviews yet"
						description="Reviews from completed customer orders will show here."
					/>
				) : (
					<Stack $gap={10}>
						{reviews.map((review) => (
							<DayCard key={review.id}>
								<Row
									$justify="space-between"
									$align="flex-start"
									$gap={12}
								>
									<Stack $gap={6}>
										<Row $gap={8} $align="center" $wrap>
											<Text $weight={800}>
												{review.buyerName || "Customer"}
											</Text>
											<Badge $tone="gold">
												{"★".repeat(review.rating)}
											</Badge>
										</Row>
										<Text $size={14}>
											{review.comment ||
												"No written comment."}
										</Text>
									</Stack>
									<Text $muted $size={12}>
										{formatDateTime(review.createdAt)}
									</Text>
								</Row>
							</DayCard>
						))}
					</Stack>
				)}
			</Stack>
		</FadeIn>
	);
}
