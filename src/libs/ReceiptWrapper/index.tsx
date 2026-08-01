"use client";

import styled from "styled-components";
import useSWR from "swr";
import { Badge, Card, FadeIn, Row, Stack, Text, Title } from "@/components";
import { PageLoader } from "@/components/Loader";
import { fetcher } from "@/constants/fetcher";
import { formatDateTime, formatKobo } from "@/constants/formatters";



// type PublicReceipt = {
// 	orderNumber: string;
// 	buyerName: string;
// 	vendorName: string;
// 	fulfillmentType: "PICKUP" | "DELIVERY";
// 	paymentDate: string;
// 	paymentStatus: string;
// 	subtotalKobo: number;
// 	serviceFeeKobo: number;
// 	amountPaidKobo: number;
// 	items: Array<{
// 		name: string;
// 		quantity: number;
// 		amountKobo: number;
// 		variantName?: string;
// 	}>;
// };







// const Wrap = styled(Stack)`
// 	width: 100%;
// 	max-width: 760px;
// 	margin: 0 auto;
// 	padding: 24px;
// `;

// const Receipt = styled.div`
// 	overflow: hidden;
// 	padding: 32px;
// 	background:
// 		radial-gradient(
// 			circle at top right,
// 			rgba(255, 112, 32, 0.1),
// 			transparent 34%
// 		),
// 		#fffdf9;
// 	border: 1px solid rgba(234, 88, 12, 0.16);
// 	border-radius: 28px;
// 	box-shadow: 0 24px 70px rgba(77, 37, 12, 0.1);

// 	@media (max-width: 600px) {
// 		padding: 22px 18px;
// 		border-radius: 22px;
// 	}
// `;

// const ReceiptHeader = styled(Row)`
// 	padding-bottom: 24px;
// 	border-bottom: 2px solid rgba(234, 88, 12, 0.75);
// `;

// const Brand = styled.div`
// 	color: var(--pc-orange, #ea580c);
// 	font-size: 34px;
// 	font-weight: 900;
// 	letter-spacing: -1.5px;
// 	line-height: 1;

// 	@media (max-width: 600px) {
// 		font-size: 28px;
// 	}
// `;

// const ReceiptLabel = styled(Text)`
// 	margin-top: 8px;
// 	color: #77716b;
// `;

// const StatusBadge = styled(Badge)`
// 	flex-shrink: 0;
// `;

// const DetailsCard = styled.div`
// 	margin-top: 20px;
// 	padding: 22px;
// 	background: rgba(255, 255, 255, 0.88);
// 	border: 1px solid rgba(120, 91, 67, 0.12);
// 	border-radius: 20px;
// 	box-shadow: 0 10px 32px rgba(77, 37, 12, 0.05);
// `;

// const DetailLine = styled(Row)`
// 	justify-content: space-between;
// 	align-items: flex-start;
// 	gap: 24px;
// 	padding: 13px 0;
// 	border-bottom: 1px solid rgba(120, 91, 67, 0.12);

// 	&:last-child {
// 		border-bottom: 0;
// 	}

// 	@media (max-width: 520px) {
// 		gap: 14px;
// 	}
// `;

// const DetailLabel = styled(Text)`
// 	color: #786f67;
// 	font-weight: 600;
// `;

// const DetailValue = styled(Text)`
// 	max-width: 65%;
// 	color: #17120f;
// 	font-weight: 750;
// 	text-align: right;
// 	word-break: break-word;
// `;

// const AmountSection = styled.div`
// 	margin-top: 20px;
// 	padding: 22px;
// 	background: rgba(255, 247, 237, 0.72);
// 	border: 1px solid rgba(234, 88, 12, 0.18);
// 	border-radius: 20px;
// `;

// const TotalBox = styled(Row)`
// 	justify-content: space-between;
// 	align-items: center;
// 	gap: 20px;
// 	margin-top: 18px;
// 	padding: 20px;
// 	background:
// 		linear-gradient(
// 			135deg,
// 			rgba(255, 247, 237, 0.96),
// 			rgba(255, 255, 255, 0.96)
// 		);
// 	border: 1px solid rgba(234, 88, 12, 0.45);
// 	border-radius: 18px;
// `;

// const TotalLabel = styled(Text)`
// 	color: var(--pc-orange, #ea580c);
// 	font-size: 22px;
// 	font-weight: 900;
// `;

// const TotalAmount = styled(Text)`
// 	color: var(--pc-orange, #ea580c);
// 	font-size: 28px;
// 	font-weight: 900;
// 	letter-spacing: -0.5px;

// 	@media (max-width: 520px) {
// 		font-size: 23px;
// 	}
// `;

// const FooterNote = styled(Text)`
// 	margin-top: 20px;
// 	color: #8c8279;
// 	text-align: center;
// `;

// export default function ReceiptWrapper({ token }: { token: string }) {
// 	const { data, isLoading } = useSWR<PublicReceipt>(
// 		`/receipts/${token}`,
// 		fetcher,
// 	);

// 	if (isLoading) return <PageLoader />;

// 	if (!data) {
// 		return (
// 			<Wrap>
// 				<Card $accent>
// 					<Title $size={20}>Receipt unavailable</Title>
// 					<Text $muted>
// 						This receipt may be invalid or no longer available.
// 					</Text>
// 				</Card>
// 			</Wrap>
// 		);
// 	}

// 	const isPaid = data.paymentStatus.toLowerCase() === "paid";

// 	return (
// 		<Wrap>
// 			<FadeIn>
// 				<Receipt>
// 					<ReceiptHeader
// 						$justify="space-between"
// 						$align="flex-start"
// 					>
// 						<Stack $gap={0}>
// 							<Brand>PreChop</Brand>
// 							<ReceiptLabel>Order receipt</ReceiptLabel>
// 						</Stack>

// 						<StatusBadge $tone={isPaid ? "success" : "warning"}>
// 							{data.paymentStatus}
// 						</StatusBadge>
// 					</ReceiptHeader>

// 					<DetailsCard>
// 						<DetailLine>
// 							<DetailLabel>Order</DetailLabel>
// 							<DetailValue>{data.orderNumber}</DetailValue>
// 						</DetailLine>

// 						<DetailLine>
// 							<DetailLabel>Vendor</DetailLabel>
// 							<DetailValue>{data.vendorName}</DetailValue>
// 						</DetailLine>

// 						<DetailLine>
// 							<DetailLabel>Payment status</DetailLabel>
// 							<DetailValue>{data.paymentStatus}</DetailValue>
// 						</DetailLine>

// 						<DetailLine>
// 							<DetailLabel>Payment date</DetailLabel>
// 							<DetailValue>
// 								{formatDateTime(data.paymentDate)}
// 							</DetailValue>
// 						</DetailLine>
// 					</DetailsCard>

// 					<AmountSection>
// 						<DetailLine>
// 							<DetailLabel>Amount paid</DetailLabel>
// 							<DetailValue>
// 								{formatKobo(data.amountPaidKobo)}
// 							</DetailValue>
// 						</DetailLine>

// 						<TotalBox>
// 							<TotalLabel>Total</TotalLabel>
// 							<TotalAmount>
// 								{formatKobo(data.amountPaidKobo)}
// 							</TotalAmount>
// 						</TotalBox>
// 					</AmountSection>

// 					<FooterNote $size={13}>
// 						Thank you for ordering with PreChop.
// 					</FooterNote>
// 				</Receipt>
// 			</FadeIn>
// 		</Wrap>
// 	);
// }

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
