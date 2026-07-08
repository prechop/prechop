"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import styled from "styled-components";
import useSWR from "swr";
import {
	Badge,
	Button,
	Card,
	Input,
	Row,
	Stack,
	Text,
	Textarea,
	Title,
} from "@/components";
import { PageLoader } from "@/components/Loader";
import { api } from "@/constants/api";
import { fetcher } from "@/constants/fetcher";
import { formatKobo, timeUntil } from "@/constants/formatters";
import { useAuth } from "@/hooks/Auth/useAuth";
import { useToast } from "@/hooks/useToast";
import type { DailyOrder, DailyOrderItem } from "@/types";

type Fulfillment = "PICKUP" | "DELIVERY";
type Line = { quantity: number; addonIds: Set<string> };

const Wrap = styled(Stack)`
	max-width: 640px;
	margin: 0 auto;
`;
const Hero = styled(Card)`
	padding: 0;
	overflow: hidden;
`;
const Cover = styled.div<{ $src?: string }>`
	height: 160px;
	background: ${(p) =>
		p.$src
			? `center / cover no-repeat url(${p.$src})`
			: "var(--pc-surface-2)"};
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 46px;
`;
const HeroBody = styled(Stack)`
	padding: var(--pc-space-5);
`;
const ItemCard = styled(Card)`
	padding: var(--pc-space-4);
`;
const SoldOut = styled(ItemCard)`
	opacity: 0.55;
`;
const AddonRow = styled.label`
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 14px;
	color: var(--pc-text-muted);
	cursor: pointer;
	padding: 4px 0;
`;
const Qty = styled(Row)`
	button {
		width: 32px;
		height: 32px;
		padding: 0;
		font-size: 18px;
	}
`;
const FeeRow = styled(Row)`
	justify-content: space-between;
	font-size: 14px;
`;
const Sticky = styled.div`
	position: sticky;
	bottom: 0;
	background: var(--pc-surface);
	border-top: 1px solid var(--pc-border);
	padding: var(--pc-space-4) 0;
	margin: 0 calc(-1 * var(--pc-space-4));
	padding-left: var(--pc-space-4);
	padding-right: var(--pc-space-4);
`;
const Toggle = styled.button<{ $active: boolean }>`
	flex: 1;
	border: 1px solid
		${(p) => (p.$active ? "var(--pc-color-primary)" : "var(--pc-border)")};
	background: ${(p) =>
		p.$active ? "var(--pc-color-primary-50)" : "var(--pc-surface)"};
	color: ${(p) =>
		p.$active ? "var(--pc-color-primary)" : "var(--pc-text-muted)"};
	font-weight: 700;
	padding: 10px;
	border-radius: var(--pc-radius-sm);
	cursor: pointer;
`;

function lineSubtotal(item: DailyOrderItem, line: Line): number {
	const addonSum = item.addons
		.filter((a) => line.addonIds.has(a.id))
		.reduce((s, a) => s + a.priceKobo, 0);
	return (item.snapshotPriceKobo + addonSum) * line.quantity;
}

export default function OrderDetailWrapper({ token }: { token: string }) {
	const router = useRouter();
	const { isAuthenticated, isLoading: authLoading } = useAuth();
	const { toast } = useToast();

	const { data, isLoading } = useSWR<DailyOrder>(
		`/daily-orders/public/${token}`,
		fetcher,
	);

	const [lines, setLines] = useState<Record<string, Line>>({});
	const [fulfillment, setFulfillment] = useState<Fulfillment>("PICKUP");
	const [hostel, setHostel] = useState("");
	const [room, setRoom] = useState("");
	const [extra, setExtra] = useState("");
	const [placing, setPlacing] = useState(false);

	const closed = data ? timeUntil(data.cutoffTime) === "closed" : false;
	const inactive = data ? data.status !== "ACTIVE" : false;

	const { subtotal, itemCount } = useMemo(() => {
		if (!data) return { subtotal: 0, itemCount: 0 };
		let sub = 0;
		let count = 0;
		for (const item of data.items) {
			const line = lines[item.id];
			if (!line || line.quantity <= 0) continue;
			sub += lineSubtotal(item, line);
			count += line.quantity;
		}
		return { subtotal: sub, itemCount: count };
	}, [data, lines]);

	if (isLoading || authLoading) return <PageLoader />;
	if (!data) {
		return (
			<Wrap>
				<Card>
					<Stack $gap={6}>
						<Title $size={18}>Listing not found</Title>
						<Text $muted>
							This listing may have closed or the link is invalid.
						</Text>
					</Stack>
				</Card>
			</Wrap>
		);
	}

	const deliveryFee = fulfillment === "DELIVERY" ? data.deliveryFeeKobo : 0;
	const canOrder = !closed && !inactive && itemCount > 0;

	function setQty(item: DailyOrderItem, delta: number) {
		setLines((prev) => {
			const cur = prev[item.id] ?? { quantity: 0, addonIds: new Set() };
			const next = Math.max(
				0,
				Math.min(item.maxQuantity ?? 50, cur.quantity + delta),
			);
			return { ...prev, [item.id]: { ...cur, quantity: next } };
		});
	}

	function toggleAddon(item: DailyOrderItem, addonId: string) {
		setLines((prev) => {
			const cur = prev[item.id] ?? { quantity: 1, addonIds: new Set() };
			const ids = new Set(cur.addonIds);
			if (ids.has(addonId)) ids.delete(addonId);
			else ids.add(addonId);
			const quantity = cur.quantity === 0 ? 1 : cur.quantity;
			return { ...prev, [item.id]: { quantity, addonIds: ids } };
		});
	}

	async function checkout() {
		if (!data) return;
		if (!isAuthenticated) {
			router.push(`/login?next=${encodeURIComponent(`/o/${token}`)}`);
			return;
		}
		if (!canOrder) return;
		if (fulfillment === "DELIVERY" && (!hostel.trim() || !room.trim())) {
			toast("Add your hostel and room for delivery.", "error");
			return;
		}
		const items = Object.entries(lines)
			.filter(([, l]) => l.quantity > 0)
			.map(([dailyOrderItemId, l]) => ({
				dailyOrderItemId,
				quantity: l.quantity,
				selectedAddonIds: Array.from(l.addonIds),
			}));

		setPlacing(true);
		try {
			const res = await api.post("/orders", {
				dailyOrderId: data.id,
				fulfillmentType: fulfillment,
				...(fulfillment === "DELIVERY"
					? {
							deliveryHostelName: hostel.trim(),
							deliveryRoomNumber: room.trim(),
							deliveryAdditionalInfo: extra.trim() || undefined,
						}
					: {}),
				items,
			});
			const payload = res.data?.data as {
				buyerOrderId: string;
				orderNumber: string;
				paymentUrl: string;
				paystackRef: string;
			};
			// Remember the mapping so the Paystack callback can resolve the order.
			if (typeof window !== "undefined") {
				window.localStorage.setItem(
					`pch-pay-${payload.paystackRef}`,
					JSON.stringify({
						buyerOrderId: payload.buyerOrderId,
						orderNumber: payload.orderNumber,
					}),
				);
			}
			window.location.href = payload.paymentUrl;
		} catch (e) {
			toast(errMsg(e), "error");
			setPlacing(false);
		}
	}

	return (
		<Wrap $gap={16}>
			<Hero>
				<Cover $src={data.items[0]?.snapshotImageUrl}>
					{data.items[0]?.snapshotImageUrl ? "" : "🍲"}
				</Cover>
				<HeroBody $gap={10}>
					<Row $justify="space-between" $align="flex-start" $gap={10}>
						<Title $size={22}>{data.title}</Title>
						<Badge
							$tone={closed || inactive ? "danger" : "warning"}
						>
							{inactive
								? "Closed"
								: closed
									? "Cutoff passed"
									: timeUntil(data.cutoffTime)}
						</Badge>
					</Row>
					<Text $muted $size={14}>
						{data.pickupAvailable && "Pickup"}
						{data.pickupAvailable &&
							data.deliveryAvailable &&
							" · "}
						{data.deliveryAvailable &&
							`Delivery ${formatKobo(data.deliveryFeeKobo)}`}
					</Text>
				</HeroBody>
			</Hero>

			<Title $size={17}>Menu</Title>
			<Stack $gap={10}>
				{data.items.map((item) => {
					const line = lines[item.id];
					const qty = line?.quantity ?? 0;
					const listingSoldOut =
						item.maxQuantity != null &&
						item.orderedQuantity >= item.maxQuantity;
					const Wrapper = listingSoldOut ? SoldOut : ItemCard;
					return (
						<Wrapper key={item.id}>
							<Stack $gap={10}>
								<Row
									$justify="space-between"
									$align="flex-start"
									$gap={10}
								>
									<Stack $gap={2}>
										<Text $weight={700}>
											{item.snapshotName}
										</Text>
										<Text $muted $size={13}>
											{formatKobo(item.snapshotPriceKobo)}{" "}
											· {item.snapshotPrepMin}m prep
										</Text>
									</Stack>
									{listingSoldOut ? (
										<Badge $tone="danger">Sold out</Badge>
									) : (
										<Qty $gap={10}>
											<Button
												$variant="secondary"
												$size="sm"
												onClick={() => setQty(item, -1)}
												disabled={
													qty === 0 ||
													closed ||
													inactive
												}
											>
												−
											</Button>
											<Text
												$weight={700}
												style={{
													minWidth: 18,
													textAlign: "center",
												}}
											>
												{qty}
											</Text>
											<Button
												$variant="secondary"
												$size="sm"
												onClick={() => setQty(item, 1)}
												disabled={closed || inactive}
											>
												＋
											</Button>
										</Qty>
									)}
								</Row>
								{qty > 0 && item.addons.length > 0 && (
									<Stack $gap={2}>
										{item.addons.map((a) => (
											<AddonRow key={a.id}>
												<input
													type="checkbox"
													checked={
														line?.addonIds.has(
															a.id,
														) ?? false
													}
													onChange={() =>
														toggleAddon(item, a.id)
													}
												/>
												{a.name} ·{" "}
												{formatKobo(a.priceKobo)}
											</AddonRow>
										))}
									</Stack>
								)}
							</Stack>
						</Wrapper>
					);
				})}
			</Stack>

			{data.deliveryAvailable && data.pickupAvailable && (
				<Row $gap={10}>
					<Toggle
						$active={fulfillment === "PICKUP"}
						onClick={() => setFulfillment("PICKUP")}
					>
						Pickup
					</Toggle>
					<Toggle
						$active={fulfillment === "DELIVERY"}
						onClick={() => setFulfillment("DELIVERY")}
					>
						Delivery
					</Toggle>
				</Row>
			)}

			{fulfillment === "DELIVERY" && (
				<Card>
					<Stack $gap={12}>
						<Text $weight={700}>Delivery details</Text>
						<Input
							label="Hostel / hall"
							value={hostel}
							onChange={(e) => setHostel(e.target.value)}
							placeholder="Kofo Hall"
						/>
						<Input
							label="Room number"
							value={room}
							onChange={(e) => setRoom(e.target.value)}
							placeholder="B12"
						/>
						<Textarea
							label="Extra directions (optional)"
							value={extra}
							onChange={(e) => setExtra(e.target.value)}
							placeholder="Call when you reach the gate"
						/>
					</Stack>
				</Card>
			)}

			<Sticky>
				<Stack $gap={10}>
					{itemCount > 0 && (
						<Stack $gap={4}>
							<FeeRow>
								<Text $muted>Subtotal</Text>
								<Text>{formatKobo(subtotal)}</Text>
							</FeeRow>
							{deliveryFee > 0 && (
								<FeeRow>
									<Text $muted>Delivery</Text>
									<Text>{formatKobo(deliveryFee)}</Text>
								</FeeRow>
							)}
							<Text $muted $size={12}>
								A small service fee is added at checkout.
							</Text>
						</Stack>
					)}
					<Button
						$full
						$size="lg"
						$loading={placing}
						onClick={checkout}
						disabled={!canOrder && isAuthenticated}
					>
						{!isAuthenticated
							? "Log in to order"
							: closed || inactive
								? "Ordering closed"
								: itemCount === 0
									? "Select items"
									: `Pay ${formatKobo(subtotal + deliveryFee)} →`}
					</Button>
				</Stack>
			</Sticky>
		</Wrap>
	);
}

function errMsg(e: unknown): string {
	const err = e as { response?: { data?: { message?: string } } };
	return err?.response?.data?.message ?? "Something went wrong. Try again.";
}
