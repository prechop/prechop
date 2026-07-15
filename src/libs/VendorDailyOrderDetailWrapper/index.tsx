"use client";

import Link from "next/link";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
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
import { PageLoader } from "@/components/Loader";
import { fetcher } from "@/constants/fetcher";
import {
	formatDate,
	formatDateTime,
	formatKobo,
	statusLabel,
	timeUntil,
} from "@/constants/formatters";
import { useToast } from "@/hooks/useToast";
import type { DailyOrder, OrderStatus } from "@/types";

interface IncomingOrder {
	id: string;
	orderNumber: string;
	status: OrderStatus;
	fulfillmentType: "PICKUP" | "DELIVERY";
	totalKobo: number;
	subtotalKobo?: number;
	deliveryFeeKobo?: number;
	prechopCommissionKobo?: number;
	vendorSettlementKobo?: number;
	createdAt?: string;
	items: Array<{ snapshotName: string; quantity: number }>;
}

const BackLink = styled(Link)`
	display: inline-flex;
	align-items: center;
	gap: 4px;
	color: var(--pc-text-muted);
	font-weight: 700;
	font-size: 13.5px;
	&:hover {
		color: var(--pc-text);
	}
`;
const ConfigGrid = styled.div`
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
	gap: var(--pc-space-3);
`;
const Field = styled(Stack)`
	gap: 2px;
`;
const ItemRow = styled.div`
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 12px;
	padding: 12px 0;
	border-bottom: 1px solid var(--pc-border);
	&:last-child {
		border-bottom: none;
	}
`;
const Progress = styled.div`
	position: relative;
	width: 100%;
	height: 7px;
	border-radius: 999px;
	background: var(--pc-surface-3);
	overflow: hidden;
	margin-top: 6px;
`;
const ProgressFill = styled.div<{ $pct: number }>`
	position: absolute;
	inset: 0 auto 0 0;
	width: ${(p) => Math.min(100, Math.max(0, p.$pct))}%;
	background: var(--pc-color-primary);
	border-radius: 999px;
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
const LinkBox = styled.div`
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 10px 12px;
	border: 1.5px solid var(--pc-border);
	border-radius: var(--pc-radius-sm);
	background: var(--pc-surface-2);
`;
const LinkText = styled.span`
	flex: 1;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 13.5px;
	font-weight: 600;
	color: var(--pc-text-muted);
`;
const ShareGrid = styled.div`
	display: grid;
	grid-template-columns: repeat(2, 1fr);
	gap: 10px;
`;
const ShareBtn = styled.a<{ $bg: string }>`
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	padding: 13px;
	border-radius: var(--pc-radius-sm);
	font-weight: 700;
	font-size: 14.5px;
	color: #fff;
	background: ${(p) => p.$bg};
	transition: filter var(--pc-dur) var(--pc-ease);
	&:hover {
		filter: brightness(1.06);
	}
`;
const QrWrap = styled.div`
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 8px;
	padding: 14px;
	border: 1.5px solid var(--pc-border);
	border-radius: var(--pc-radius-sm);
	background: var(--pc-surface-2);
`;
const QrImg = styled.img`
	width: 180px;
	height: 180px;
	max-width: 100%;
	border-radius: 8px;
	background: #fff;
`;
const LockNote = styled.div`
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 10px 12px;
	border-radius: var(--pc-radius-sm);
	background: var(--pc-surface-2);
	border: 1px solid var(--pc-border);
	font-size: 13px;
	font-weight: 600;
	color: var(--pc-text-muted);
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
	const status = (e as { response?: { status?: number } })?.response?.status;
	if (status === 404) return "This daily order could not be found.";
	if (status === 403) return "You don't have access to this daily order.";
	return "Couldn't load this daily order. Please try again.";
}

export default function VendorDailyOrderDetailWrapper({
	orderId,
}: {
	orderId: string;
}) {
	const { toast } = useToast();
	const [copied, setCopied] = useState(false);
	const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

	const {
		data: order,
		isLoading,
		error,
	} = useSWR<DailyOrder>(`/daily-orders/my-orders/${orderId}`, fetcher, {
		refreshInterval: 15_000,
	});

	// Buyer orders placed against this listing (vendor-scoped, same source the
	// dashboard's "Incoming orders" uses). Only meaningful once it has opened.
	const { data: incoming } = useSWR<IncomingOrder[]>(
		order ? `/vendor/daily-orders/${orderId}/orders` : null,
		fetcher,
		{ refreshInterval: 15_000 },
	);

	// Render a scannable QR for the public listing link. Encoded as a data: URI
	// (CSP-safe — no external request) and regenerated if the token changes.
	const shareToken = order?.shareableToken;
	useEffect(() => {
		if (!shareToken) return;
		const url = `${window.location.origin}/o/${shareToken}`;
		let cancelled = false;
		QRCode.toDataURL(url, { width: 220, margin: 1 })
			.then((dataUrl) => {
				if (!cancelled) setQrDataUrl(dataUrl);
			})
			.catch(() => {
				if (!cancelled) setQrDataUrl(null);
			});
		return () => {
			cancelled = true;
		};
	}, [shareToken]);

	if (isLoading) return <PageLoader />;

	if (error || !order) {
		return (
			<FadeIn>
				<Stack $gap={20}>
					<PageHeader
						eyebrow="Vendor · Daily order"
						title="Daily order"
						subtitle="We couldn't open this listing."
					/>
					<EmptyState
						icon="🚫"
						title="Not available"
						description={errMsg(error)}
						action={
							<Button as={Link} href="/dashboard">
								Back to dashboard
							</Button>
						}
					/>
				</Stack>
			</FadeIn>
		);
	}

	const opensAt = order.availableFrom
		? new Date(order.availableFrom).getTime()
		: null;
	const comingSoon = opensAt !== null && opensAt > Date.now();
	// Editable only until orders open — mirrors the server + composer lock exactly:
	// not closed/cancelled, has an open time, and that time is still in the future.
	const editable =
		(order.status === "DRAFT" || order.status === "ACTIVE") &&
		opensAt !== null &&
		opensAt > Date.now();
	const closed = timeUntil(order.cutoffTime) === "closed";
	const windowLabel =
		order.status !== "ACTIVE"
			? statusLabel(order.status)
			: comingSoon
				? `🔜 Opens ${formatDateTime(order.availableFrom as string)}`
				: closed
					? "Cutoff passed"
					: timeUntil(order.cutoffTime);
	const windowTone: "primary" | "warning" | "danger" | "muted" =
		order.status !== "ACTIVE"
			? "muted"
			: comingSoon
				? "primary"
				: closed
					? "danger"
					: "warning";

	const shareUrl =
		typeof window !== "undefined"
			? `${window.location.origin}/o/${order.shareableToken}`
			: `/o/${order.shareableToken}`;
	const shareText = `${order.title} — order now on Prechop: ${shareUrl}`;
	const waHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
	const tgHref = `https://t.me/share/url?url=${encodeURIComponent(
		shareUrl,
	)}&text=${encodeURIComponent(order.title)}`;

	async function copyLink() {
		try {
			await navigator.clipboard.writeText(shareUrl);
			setCopied(true);
			toast("Link copied", "success");
			setTimeout(() => setCopied(false), 2000);
		} catch {
			toast("Couldn't copy — long-press the link to copy it", "error");
		}
	}

	const totalCapacity = order.items.reduce(
		(sum, it) => sum + (it.maxQuantity ?? 0),
		0,
	);
	const hasCapacity = order.items.every(
		(it) => it.maxQuantity != null && it.maxQuantity > 0,
	);
	const totalOrdered = order.items.reduce(
		(sum, it) => sum + (it.orderedQuantity ?? 0),
		0,
	);

	return (
		<FadeIn>
			<Stack $gap={20}>
				<BackLink href="/dashboard">
					<span aria-hidden>←</span> Back to dashboard
				</BackLink>

				<Row
					$justify="space-between"
					$align="flex-start"
					$gap={12}
					$wrap
				>
					<PageHeader
						eyebrow="Vendor · Daily order"
						title={order.title}
						subtitle={`Scheduled ${formatDate(order.scheduledDate)}`}
					/>
					<Badge $tone={statusTone(order.status)}>
						{statusLabel(order.status)}
					</Badge>
				</Row>

				{editable ? (
					<Button
						as={Link}
						href={`/dashboard/${order.id}/edit`}
						$full
					>
						<span aria-hidden>✏️</span> Edit daily order
					</Button>
				) : (
					<LockNote>
						<span aria-hidden>🔒</span>
						{order.status === "CLOSED" ||
						order.status === "CANCELLED"
							? "This listing is finished — view only."
							: "Orders have opened — this listing is now view only."}
					</LockNote>
				)}

				<Grid $min={150} $gap={12}>
					<StatCard
						label="Orders placed"
						value={order.totalOrdersCount}
						icon="🧾"
						hint="Buyers so far"
					/>
					<StatCard
						label="Units ordered"
						value={totalOrdered}
						icon="🍽️"
						tone="var(--pc-color-accent)"
						hint={
							hasCapacity
								? `of ${totalCapacity} capacity`
								: "no cap"
						}
					/>
					<StatCard
						label="Menu items"
						value={order.items.length}
						icon="🍲"
						tone="var(--pc-color-gold)"
						hint="On this listing"
					/>
				</Grid>

				<Card>
					<Stack $gap={14}>
						<SectionHeader title="Listing configuration" icon="⚙️" />
						<ConfigGrid>
							<Field>
								<Text $muted $size={12}>
									Menu date
								</Text>
								<Text $weight={700}>
									{formatDate(order.scheduledDate)}
								</Text>
							</Field>
							<Field>
								<Text $muted $size={12}>
									Orders open
								</Text>
								<Text $weight={700}>
									{order.availableFrom
										? formatDateTime(order.availableFrom)
										: "Immediately"}
								</Text>
							</Field>
							<Field>
								<Text $muted $size={12}>
									Orders close
								</Text>
								<Text $weight={700}>
									{formatDateTime(order.cutoffTime)}
								</Text>
							</Field>
							<Field>
								<Text $muted $size={12}>
									Window
								</Text>
								<Badge $tone={windowTone}>{windowLabel}</Badge>
							</Field>
							<Field>
								<Text $muted $size={12}>
									Fulfilment
								</Text>
								<Text $weight={700}>
									{[
										order.pickupAvailable && "🥡 Pickup",
										order.deliveryAvailable &&
											"🛵 Delivery",
									]
										.filter(Boolean)
										.join(" · ") || "—"}
								</Text>
							</Field>
							{order.deliveryAvailable && (
								<Field>
									<Text $muted $size={12}>
										Delivery fee
									</Text>
									<Text $weight={700}>
										{order.deliveryFeeKobo > 0
											? formatKobo(order.deliveryFeeKobo)
											: "Free"}
									</Text>
								</Field>
							)}
						</ConfigGrid>
					</Stack>
				</Card>

				<Card>
					<Stack $gap={6}>
						<SectionHeader title="Items & progress" icon="🍲" />
						<div>
							{order.items.map((it) => {
								const cap = it.maxQuantity ?? null;
								const pct =
									cap && cap > 0
										? (it.orderedQuantity / cap) * 100
										: 0;
								return (
									<ItemRow key={it.id}>
										<Stack $gap={4} style={{ flex: 1 }}>
											<Text $weight={700}>
												{it.snapshotName}
											</Text>
											{it.optionGroups.length > 0 && (
												<Text $muted $size={12}>
													{it.optionGroups
														.map((g) => g.name)
														.join(" · ")}
												</Text>
											)}
											{cap && cap > 0 && (
												<Progress
													aria-label={`${it.orderedQuantity} of ${cap} ordered`}
												>
													<ProgressFill $pct={pct} />
												</Progress>
											)}
										</Stack>
										<Stack
											$gap={2}
											style={{ alignItems: "flex-end" }}
										>
											<Text $weight={800}>
												{formatKobo(
													it.snapshotPriceKobo,
												)}
											</Text>
											<Text $muted $size={12}>
												{it.orderedQuantity}
												{cap && cap > 0
													? ` / ${cap}`
													: " ordered"}
											</Text>
										</Stack>
									</ItemRow>
								);
							})}
						</div>
					</Stack>
				</Card>

				<Card>
					<Stack $gap={6}>
						<SectionHeader
							title="Buyer orders"
							icon="🔔"
							action={
								<Text $muted $size={12}>
									{incoming?.length ?? 0} order
									{(incoming?.length ?? 0) === 1 ? "" : "s"}
								</Text>
							}
						/>
						{(incoming?.length ?? 0) === 0 ? (
							<EmptyState
								icon="🕓"
								title="No orders yet"
								description={
									comingSoon
										? "Orders will appear here once this listing opens."
										: "No buyers have ordered from this listing yet."
								}
							/>
						) : (
							<div>
								{(incoming ?? []).map((o) => (
									<IncomingItem key={o.id}>
										<Stack $gap={3}>
											<Row $gap={8} $align="center">
												<Text $weight={700} $size={14}>
													#{o.orderNumber}
												</Text>
												<Badge
													$tone={orderTone(o.status)}
												>
													{statusLabel(o.status)}
												</Badge>
											</Row>
											<Text $muted $size={12}>
												{o.fulfillmentType ===
												"DELIVERY"
													? "🛵 Delivery"
													: "🥡 Pickup"}{" "}
												·{" "}
												{o.items.reduce(
													(n, it) => n + it.quantity,
													0,
												)}{" "}
												item(s)
											</Text>
											{o.subtotalKobo != null && (
												<Text $muted $size={12}>
													Food{" "}
													{formatKobo(o.subtotalKobo)}{" "}
													· Commission{" "}
													{formatKobo(
														o.prechopCommissionKobo ??
															0,
													)}{" "}
													· Delivery{" "}
													{formatKobo(
														o.deliveryFeeKobo ?? 0,
													)}
												</Text>
											)}
										</Stack>
										<Stack
											$gap={2}
											style={{ alignItems: "flex-end" }}
										>
											<Text $weight={800} $size={14}>
												{formatKobo(
													o.vendorSettlementKobo ??
														o.totalKobo,
												)}
											</Text>
											<Text $muted $size={11}>
												Vendor settlement
											</Text>
										</Stack>
									</IncomingItem>
								))}
							</div>
						)}
					</Stack>
				</Card>

				<Card>
					<Stack $gap={14}>
						<SectionHeader title="Share this listing" icon="🔗" />
						<LinkBox>
							<LinkText>{shareUrl}</LinkText>
							<Button
								$size="sm"
								$variant={copied ? "secondary" : "primary"}
								onClick={copyLink}
							>
								{copied ? "Copied ✓" : "Copy"}
							</Button>
						</LinkBox>
						<ShareGrid>
							<ShareBtn
								href={waHref}
								target="_blank"
								rel="noopener noreferrer"
								$bg="#25D366"
							>
								<span aria-hidden>💬</span> WhatsApp
							</ShareBtn>
							<ShareBtn
								href={tgHref}
								target="_blank"
								rel="noopener noreferrer"
								$bg="#229ED9"
							>
								<span aria-hidden>✈️</span> Telegram
							</ShareBtn>
						</ShareGrid>
						{qrDataUrl && (
							<QrWrap>
								<QrImg
									src={qrDataUrl}
									alt={`QR code linking to ${order.title}`}
								/>
								<Text $muted $size={12}>
									Scan to open the listing
								</Text>
							</QrWrap>
						)}
						<Button
							as={Link}
							href={`/o/${order.shareableToken}`}
							target="_blank"
							$variant="secondary"
							$full
						>
							View public listing
						</Button>
					</Stack>
				</Card>
			</Stack>
		</FadeIn>
	);
}
