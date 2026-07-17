"use client";

import styled from "styled-components";
import useSWR from "swr";
import { Badge, Card, FadeIn, Row, Stack, Text, Title } from "@/components";
import { PageLoader } from "@/components/Loader";
import { fetcher } from "@/constants/fetcher";
import { formatDateTime, formatKobo } from "@/constants/formatters";

interface PublicReceipt {
	vendorName: string;
	orderNumber: string;
	amountPaidKobo: number;
	paymentStatus: "PAID";
	paymentDate: string;
	receiptLink: string;
}

const Wrap = styled(Stack)`
	max-width: 520px;
	margin: 0 auto;
`;

const Hero = styled(Card)`
	background: var(--pc-gradient-calm-orange);
	border: none;
`;

const Line = styled(Row)`
	justify-content: space-between;
	font-size: 14px;
`;

export default function ReceiptWrapper({ token }: { token: string }) {
	const { data, isLoading } = useSWR<PublicReceipt>(
		`/receipts/${token}`,
		fetcher,
	);

	if (isLoading) return <PageLoader />;
	if (!data) {
		return (
			<Wrap>
				<Card $accent>
					<Title $size={20}>Receipt unavailable</Title>
					<Text $muted>
						This receipt may be invalid or no longer available.
					</Text>
				</Card>
			</Wrap>
		);
	}

	return (
		<Wrap $gap={16}>
			<FadeIn>
				<Hero>
					<Stack $gap={8}>
						<Row $justify="space-between" $align="flex-start">
							<Stack $gap={4}>
								<Title $size={24}>{data.vendorName}</Title>
								<Text $muted $size={13}>
									Order {data.orderNumber}
								</Text>
							</Stack>
							<Badge $tone="success">Paid</Badge>
						</Row>
					</Stack>
				</Hero>
			</FadeIn>

			<Card>
				<Stack $gap={12}>
					<Text $weight={800}>Receipt</Text>
					<Line>
						<Text $muted>Amount paid</Text>
						<Text $weight={800}>
							{formatKobo(data.amountPaidKobo)}
						</Text>
					</Line>
					<Line>
						<Text $muted>Status</Text>
						<Text>{data.paymentStatus}</Text>
					</Line>
					<Line>
						<Text $muted>Date</Text>
						<Text>{formatDateTime(data.paymentDate)}</Text>
					</Line>
				</Stack>
			</Card>
		</Wrap>
	);
}
