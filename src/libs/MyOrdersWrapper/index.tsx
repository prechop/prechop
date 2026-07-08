"use client";

import Link from "next/link";
import styled from "styled-components";
import useSWR from "swr";
import { Badge, Card, Row, Stack, Text, Title } from "@/components";
import { PageLoader } from "@/components/Loader";
import { fetcher } from "@/constants/fetcher";
import {
	formatDateTime,
	formatKobo,
	statusLabel,
} from "@/constants/formatters";
import type { BuyerOrder, OrderStatus } from "@/types";

const tone: Record<
	OrderStatus,
	"primary" | "success" | "warning" | "danger" | "muted"
> = {
	PENDING_PAYMENT: "warning",
	PAID: "primary",
	CONFIRMED: "primary",
	PREPARING: "warning",
	READY: "success",
	COMPLETED: "success",
	CANCELLED: "danger",
	REFUNDED: "muted",
};

const OrderCard = styled(Card)`
	padding: var(--pc-space-4);
	transition: box-shadow 0.15s ease;
	&:hover { box-shadow: var(--pc-shadow-lg); }
`;
const CardLink = styled(Link)`
	color: inherit;
	display: block;
`;
const Empty = styled(Card)`
	text-align: center;
	padding: var(--pc-space-8) var(--pc-space-5);
`;

export default function MyOrdersWrapper() {
	const { data, isLoading } = useSWR<BuyerOrder[]>(
		"/orders?limit=50",
		fetcher,
	);

	if (isLoading) return <PageLoader />;
	const orders = data ?? [];

	return (
		<Stack $gap={16}>
			<Title $size={24}>My orders</Title>

			{orders.length === 0 ? (
				<Empty>
					<Stack $gap={6}>
						<Text $weight={700} $size={16}>
							No orders yet
						</Text>
						<Text $muted>
							Browse today&apos;s kitchens and place your first
							order.
						</Text>
						<Link href="/marketplace">
							<Text
								$weight={700}
								style={{ color: "var(--pc-color-primary)" }}
							>
								Go to marketplace →
							</Text>
						</Link>
					</Stack>
				</Empty>
			) : (
				<Stack $gap={10}>
					{orders.map((o) => (
						<CardLink key={o.id} href={`/my-orders/${o.id}`}>
							<OrderCard>
								<Stack $gap={8}>
									<Row
										$justify="space-between"
										$align="flex-start"
										$gap={10}
									>
										<Stack $gap={2}>
											<Text $weight={700}>
												{o.orderNumber}
											</Text>
											<Text $muted $size={13}>
												{formatDateTime(o.createdAt)}
											</Text>
										</Stack>
										<Badge $tone={tone[o.status]}>
											{statusLabel(o.status)}
										</Badge>
									</Row>
									<Row $justify="space-between">
										<Text $muted $size={13}>
											{o.items.length} item
											{o.items.length === 1 ? "" : "s"} ·{" "}
											{o.fulfillmentType === "DELIVERY"
												? "Delivery"
												: "Pickup"}
										</Text>
										<Text $weight={700}>
											{formatKobo(o.totalKobo)}
										</Text>
									</Row>
								</Stack>
							</OrderCard>
						</CardLink>
					))}
				</Stack>
			)}
		</Stack>
	);
}
