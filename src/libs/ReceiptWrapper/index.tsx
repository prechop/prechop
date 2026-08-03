"use client";

import styled, { keyframes } from "styled-components";
import useSWR from "swr";
import { fetcher } from "@/constants/fetcher";
import { formatDateTime, formatKobo } from "@/constants/formatters";
import { PageLoader } from "@/components/Loader";

// ─── types ────────────────────────────────────────────────────────────────────

interface ReceiptItem {
  name: string;
  quantity: number;
  unitPriceKobo: number;
  totalKobo: number;
}

interface PublicReceipt {
  vendorName: string;
  vendorLocation?: string;
  buyerName: string;
  orderNumber: string;
  fulfillmentType: "PICKUP" | "DELIVERY";
  deliveryAddress?: string;
  orderStatus: string;
  items: ReceiptItem[];
  subtotalKobo: number;
  serviceFeeKobo: number;
  deliveryFeeKobo: number;
  totalKobo: number;
  paymentMethod: string;
  paymentDate: string;
  receiptUrl?: string;
}

// ─── animations ───────────────────────────────────────────────────────────────

const fadeUp = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
`;

// ─── layout ───────────────────────────────────────────────────────────────────

const Page = styled.div`
  min-height: 100vh;
  background: var(--pc-surface-2, #f4f4f2);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 32px 16px 64px;
`;

const Receipt = styled.div`
  width: 100%;
  max-width: 560px;
  background: #ffffff;
  border-radius: 4px;
  box-shadow: 0 4px 32px rgba(26, 20, 16, 0.12);
  overflow: hidden;
  animation: ${fadeUp} 0.35s var(--pc-ease, ease) both;
  font-family: var(--pc-font-sans, system-ui, sans-serif);
  color: #1a1410;
`;

// ─── header ───────────────────────────────────────────────────────────────────

const Header = styled.div`
  padding: 28px 28px 24px;
  border-bottom: 2px solid #f0ede8;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
`;

const LogoMark = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const LogoIcon = styled.div`
  width: 42px;
  height: 42px;
  background: var(--pc-color-primary, #e8552e);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  svg {
    width: 24px;
    height: 24px;
    fill: #fff;
  }
`;

const LogoText = styled.span`
  font-size: 22px;
  font-weight: 800;
  color: var(--pc-color-primary, #e8552e);
  letter-spacing: -0.4px;
  font-family: var(--pc-font-display, var(--pc-font-sans));
`;

const HeaderRight = styled.div`
  text-align: right;
`;

const ReceiptLabel = styled.div`
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #1a1410;
  margin-bottom: 6px;
`;

const PaidBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--pc-color-primary, #e8552e);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  padding: 5px 12px;
  border-radius: 6px;
  letter-spacing: 0.04em;

  &::before {
    content: "✓";
    font-size: 11px;
  }
`;

const Divider = styled.div`
  height: 2px;
  background: var(--pc-color-primary, #e8552e);
  margin: 0 28px;
`;

// ─── order id section ─────────────────────────────────────────────────────────

const OrderIdSection = styled.div`
  margin: 20px 28px;
  padding: 16px 20px;
  background: #fff8f0;
  border-radius: 10px;
  border: 1px solid #f0ede8;
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const OrderIdGroup = styled.div``;

const OrderIdLabel = styled.div`
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--pc-color-primary, #e8552e);
  margin-bottom: 4px;
`;

const OrderIdValue = styled.div`
  font-size: 22px;
  font-weight: 800;
  color: #1a1410;
  letter-spacing: -0.3px;
`;

const CopyIcon = styled.button`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1.5px solid #e8e4de;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #7a6e62;
  flex-shrink: 0;
  transition:
    border-color 0.15s,
    color 0.15s;

  &:hover {
    border-color: var(--pc-color-primary, #e8552e);
    color: var(--pc-color-primary, #e8552e);
  }
`;

// ─── meta grid ────────────────────────────────────────────────────────────────

const MetaGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  margin: 0 28px 20px;
  border: 1px solid #f0ede8;
  border-radius: 10px;
  overflow: hidden;
`;

const MetaCell = styled.div<{ $border?: boolean }>`
  padding: 14px 16px;
  border-right: ${({ $border }) => ($border ? "1px solid #f0ede8" : "none")};
  border-bottom: 1px solid #f0ede8;

  &:nth-last-child(-n + 2) {
    border-bottom: none;
  }
`;

const MetaIcon = styled.div`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1.5px solid var(--pc-color-primary, #e8552e);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
  color: var(--pc-color-primary, #e8552e);
  font-size: 14px;
`;

const MetaLabel = styled.div`
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--pc-color-primary, #e8552e);
  margin-bottom: 3px;
`;

const MetaValue = styled.div`
  font-size: 13px;
  font-weight: 500;
  color: #1a1410;
  line-height: 1.4;
`;

// ─── items table ──────────────────────────────────────────────────────────────

const TableWrap = styled.div`
  margin: 0 28px 20px;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid #f0ede8;
`;

const TableHead = styled.div`
  background: var(--pc-color-primary, #e8552e);
  display: grid;
  grid-template-columns: 1fr 60px 100px 90px;
  padding: 10px 16px;
  gap: 8px;
`;

const ThCell = styled.div`
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: #fff;

  &:not(:first-child) {
    text-align: right;
  }
`;

const TableRow = styled.div<{ $alt?: boolean }>`
  display: grid;
  grid-template-columns: 1fr 60px 100px 90px;
  padding: 12px 16px;
  gap: 8px;
  background: ${({ $alt }) => ($alt ? "#fff8f0" : "#fff")};
  border-top: 1px solid #f0ede8;

  &:first-of-type {
    border-top: none;
  }
`;

const TdCell = styled.div`
  font-size: 14px;
  color: #1a1410;

  &:not(:first-child) {
    text-align: right;
    font-weight: 500;
  }
`;

// ─── totals ───────────────────────────────────────────────────────────────────

const Totals = styled.div`
  margin: 0 28px 20px;
  border: 1px solid #f0ede8;
  border-radius: 10px;
  overflow: hidden;
`;

const TotalRow = styled.div<{ $bold?: boolean; $last?: boolean }>`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ${({ $bold }) => ($bold ? "14px 16px" : "10px 16px")};
  border-top: ${({ $last }) => ($last ? "1.5px dashed #e8e4de" : "none")};
  background: ${({ $bold }) => ($bold ? "#fff8f0" : "#fff")};

  &:first-child {
    border-top: none;
  }
`;

const TotalLabel = styled.span<{ $bold?: boolean }>`
  font-size: ${({ $bold }) => ($bold ? "15px" : "14px")};
  font-weight: ${({ $bold }) => ($bold ? "700" : "400")};
  color: ${({ $bold }) => ($bold ? "#1a1410" : "#7a6e62")};
`;

const TotalValue = styled.span<{ $bold?: boolean; $accent?: boolean }>`
  font-size: ${({ $bold }) => ($bold ? "18px" : "14px")};
  font-weight: ${({ $bold }) => ($bold ? "800" : "500")};
  color: ${({ $accent }) =>
    $accent ? "var(--pc-color-primary, #e8552e)" : "#1a1410"};
`;

// ─── payment method ───────────────────────────────────────────────────────────

const PaymentRow = styled.div`
  margin: 0 28px 20px;
  border: 1px solid #f0ede8;
  border-radius: 10px;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

const PaymentLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const PaymentIcon = styled.div`
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: #fff0e6;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--pc-color-primary, #e8552e);
  font-size: 16px;
`;

const PaymentMeta = styled.div``;

const PaymentLabel = styled.div`
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--pc-color-primary, #e8552e);
  margin-bottom: 2px;
`;

const PaymentValue = styled.div`
  font-size: 13px;
  color: #1a1410;
  font-weight: 500;
`;

const PaymentAmount = styled.div`
  font-size: 16px;
  font-weight: 800;
  color: #1a1410;
`;

// ─── thank you footer ─────────────────────────────────────────────────────────

const ThankYou = styled.div`
  margin: 0 28px 24px;
  background: #fff8f0;
  border: 1px solid #f0ede8;
  border-radius: 10px;
  padding: 20px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
`;

const ThankYouLeft = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 14px;
`;

const HeartCircle = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1.5px solid var(--pc-color-primary, #e8552e);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--pc-color-primary, #e8552e);
  font-size: 18px;
`;

const ThankYouText = styled.div``;

const ThankYouTitle = styled.div`
  font-size: 14px;
  font-weight: 700;
  color: var(--pc-color-primary, #e8552e);
  margin-bottom: 4px;
`;

const ThankYouBody = styled.div`
  font-size: 12px;
  color: #7a6e62;
  line-height: 1.5;
  margin-bottom: 6px;
`;

const ThankYouTagline = styled.div`
  font-size: 12px;
  font-weight: 700;
  color: #1a1410;
`;

const QrPlaceholder = styled.div`
  width: 72px;
  height: 72px;
  border: 1.5px solid #e8e4de;
  border-radius: 8px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  background: #fff;
`;

const QrGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(5, 8px);
  grid-template-rows: repeat(5, 8px);
  gap: 1.5px;
`;

const QrDot = styled.div<{ $filled: boolean }>`
  width: 8px;
  height: 8px;
  border-radius: 1px;
  background: ${({ $filled }) => ($filled ? "#1a1410" : "transparent")};
`;

const QrUrl = styled.div`
  font-size: 7px;
  color: var(--pc-color-primary, #e8552e);
  font-weight: 600;
  text-align: center;
`;

// ─── help footer ──────────────────────────────────────────────────────────────

const HelpFooter = styled.div`
  border-top: 2px solid #f0ede8;
  padding: 16px 28px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
`;

const HelpBlock = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;
`;

const HelpIcon = styled.div`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1.5px solid #e8e4de;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 14px;
  color: #7a6e62;
`;

const HelpText = styled.div``;

const HelpLabel = styled.div`
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #1a1410;
  margin-bottom: 2px;
`;

const HelpValue = styled.div`
  font-size: 11px;
  color: #7a6e62;
  line-height: 1.4;

  a {
    color: var(--pc-color-primary, #e8552e);
    text-decoration: none;
    font-weight: 500;
  }
`;

// ─── QR pattern ───────────────────────────────────────────────────────────────

const QR_PATTERN = [
  true,
  true,
  true,
  false,
  true,
  true,
  false,
  true,
  false,
  true,
  true,
  true,
  true,
  true,
  false,
  false,
  true,
  false,
  true,
  true,
  true,
  false,
  true,
  true,
  true,
];

// ─── component ────────────────────────────────────────────────────────────────

export default function ReceiptWrapper({ token }: { token: string }) {
  const { data, isLoading } = useSWR<PublicReceipt>(
    `/receipts/${token}`,
    fetcher,
  );

  if (isLoading) return <PageLoader />;

  if (!data) {
    return (
      <Page>
        <Receipt style={{ padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🧾</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
            Receipt unavailable
          </div>
          <div style={{ fontSize: 14, color: "#7a6e62" }}>
            This receipt may be invalid or no longer available.
          </div>
        </Receipt>
      </Page>
    );
  }

  const hasFee = data.serviceFeeKobo > 0;
  const hasDelivery = data.deliveryFeeKobo > 0;

  function copyOrderNumber() {
    navigator.clipboard.writeText(data!.orderNumber).catch(() => {});
  }

  return (
    <Page>
      <Receipt>
        {/* ── Header ── */}
        <Header>
          <LogoMark>
            <LogoIcon>
              {/* dish-cloche icon */}
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M2 13h20v2H2v-2zm1.5-3A8.5 8.5 0 0 1 12 1.5 8.5 8.5 0 0 1 20.5 10H3.5zM11 1v2h2V1h-2zm8.07 1.93-1.41 1.41 1.41 1.41 1.41-1.41-1.41-1.41zM3.93 2.93 2.52 4.34l1.41 1.41 1.41-1.41-1.41-1.41zM22 17H2v2h20v-2z" />
              </svg>
            </LogoIcon>
            <LogoText>Prechop</LogoText>
          </LogoMark>
          <HeaderRight>
            <ReceiptLabel>Order Receipt</ReceiptLabel>
            <PaidBadge>PAID</PaidBadge>
          </HeaderRight>
        </Header>

        <Divider />

        {/* ── Order ID ── */}
        <OrderIdSection>
          <OrderIdGroup>
            <OrderIdLabel>Order ID</OrderIdLabel>
            <OrderIdValue>{data.orderNumber}</OrderIdValue>
          </OrderIdGroup>
          <CopyIcon onClick={copyOrderNumber} title="Copy order number">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </CopyIcon>
        </OrderIdSection>

        {/* ── Meta grid ── */}
        <MetaGrid>
          <MetaCell $border>
            <MetaIcon>👤</MetaIcon>
            <MetaLabel>Buyer</MetaLabel>
            <MetaValue>{data.buyerName}</MetaValue>
          </MetaCell>

          <MetaCell>
            <MetaIcon>📅</MetaIcon>
            <MetaLabel>Date &amp; Time</MetaLabel>
            <MetaValue>{formatDateTime(data.paymentDate)}</MetaValue>
          </MetaCell>

          <MetaCell $border>
            <MetaIcon>🏪</MetaIcon>
            <MetaLabel>Vendor</MetaLabel>
            <MetaValue>{data.vendorName}</MetaValue>
          </MetaCell>

          <MetaCell>
            <MetaIcon>📍</MetaIcon>
            <MetaLabel>
              {data.fulfillmentType === "DELIVERY"
                ? "Delivery Address"
                : "Pickup Location"}
            </MetaLabel>
            <MetaValue>
              {data.fulfillmentType === "DELIVERY"
                ? (data.deliveryAddress ?? "—")
                : (data.vendorLocation ?? data.vendorName)}
            </MetaValue>
          </MetaCell>

          <MetaCell $border>
            <MetaIcon>🛍️</MetaIcon>
            <MetaLabel>Fulfillment</MetaLabel>
            <MetaValue>
              {data.fulfillmentType === "DELIVERY" ? "Delivery" : "Pickup"}
            </MetaValue>
          </MetaCell>

          <MetaCell>
            <MetaIcon>✅</MetaIcon>
            <MetaLabel>Order Status</MetaLabel>
            <MetaValue>
              {data.orderStatus.charAt(0).toUpperCase() +
                data.orderStatus.slice(1).toLowerCase()}
            </MetaValue>
          </MetaCell>
        </MetaGrid>

        {/* ── Items table ── */}
        <TableWrap>
          <TableHead>
            <ThCell>Item</ThCell>
            <ThCell>Qty</ThCell>
            <ThCell>Unit Price</ThCell>
            <ThCell>Total</ThCell>
          </TableHead>

          {data.items.map((item, i) => (
            <TableRow key={i} $alt={i % 2 === 1}>
              <TdCell>{item.name}</TdCell>
              <TdCell>{item.quantity}</TdCell>
              <TdCell>{formatKobo(item.unitPriceKobo)}</TdCell>
              <TdCell>{formatKobo(item.totalKobo)}</TdCell>
            </TableRow>
          ))}
        </TableWrap>

        {/* ── Totals ── */}
        <Totals>
          <TotalRow>
            <TotalLabel>Subtotal</TotalLabel>
            <TotalValue>{formatKobo(data.subtotalKobo)}</TotalValue>
          </TotalRow>

          {hasFee && (
            <TotalRow>
              <TotalLabel>Service fee</TotalLabel>
              <TotalValue>{formatKobo(data.serviceFeeKobo)}</TotalValue>
            </TotalRow>
          )}

          {hasDelivery && (
            <TotalRow>
              <TotalLabel>Delivery fee</TotalLabel>
              <TotalValue>{formatKobo(data.deliveryFeeKobo)}</TotalValue>
            </TotalRow>
          )}

          <TotalRow $bold $last>
            <TotalLabel $bold>TOTAL</TotalLabel>
            <TotalValue $bold $accent>
              {formatKobo(data.totalKobo)}
            </TotalValue>
          </TotalRow>
        </Totals>

        {/* ── Payment method ── */}
        <PaymentRow>
          <PaymentLeft>
            <PaymentIcon>💳</PaymentIcon>
            <PaymentMeta>
              <PaymentLabel>Payment Method</PaymentLabel>
              <PaymentValue>{data.paymentMethod}</PaymentValue>
            </PaymentMeta>
          </PaymentLeft>
          <PaymentAmount>{formatKobo(data.totalKobo)}</PaymentAmount>
        </PaymentRow>

        {/* ── Thank you ── */}
        <ThankYou>
          <ThankYouLeft>
            <HeartCircle>♥</HeartCircle>
            <ThankYouText>
              <ThankYouTitle>Thank you for using Prechop!</ThankYouTitle>
              <ThankYouBody>
                We appreciate your order and look forward to serving you again.
              </ThankYouBody>
              <ThankYouTagline>
                Order delicious. Eat better. Live easier.
              </ThankYouTagline>
            </ThankYouText>
          </ThankYouLeft>

          <QrPlaceholder>
            <QrGrid>
              {QR_PATTERN.map((filled, i) => (
                <QrDot key={i} $filled={filled} />
              ))}
            </QrGrid>
            <QrUrl>prechop.com.ng</QrUrl>
          </QrPlaceholder>
        </ThankYou>

        {/* ── Help footer ── */}
        <HelpFooter>
          <HelpBlock>
            <HelpIcon>🎧</HelpIcon>
            <HelpText>
              <HelpLabel>Need Help?</HelpLabel>
              <HelpValue>
                Contact us at{" "}
                <a href="mailto:support@prechop.com.ng">
                  support@prechop.com.ng
                </a>
                <br />
                or chat with us in the app.
              </HelpValue>
            </HelpText>
          </HelpBlock>

          <HelpBlock>
            <HelpIcon>🌐</HelpIcon>
            <HelpText>
              <HelpLabel>Visit Us</HelpLabel>
              <HelpValue>
                <a
                  href="https://prechop.com.ng"
                  target="_blank"
                  rel="noreferrer">
                  www.prechop.com.ng
                </a>
              </HelpValue>
            </HelpText>
          </HelpBlock>
        </HelpFooter>
      </Receipt>
    </Page>
  );
}

// "use client";

// import styled from "styled-components";
// import useSWR from "swr";
// import { Badge, Card, FadeIn, Row, Stack, Text, Title } from "@/components";
// import { PageLoader } from "@/components/Loader";
// import { fetcher } from "@/constants/fetcher";
// import { formatDateTime, formatKobo } from "@/constants/formatters";

// interface PublicReceipt {
//   vendorName: string;
//   orderNumber: string;
//   amountPaidKobo: number;
//   paymentStatus: "PAID";
//   paymentDate: string;
//   receiptLink: string;
// }

// const Wrap = styled(Stack)`
//   max-width: 520px;
//   margin: 0 auto;
// `;

// const Hero = styled(Card)`
//   background: var(--pc-gradient-calm-orange);
//   border: none;
// `;

// const Line = styled(Row)`
//   justify-content: space-between;
//   font-size: 14px;
// `;

// export default function ReceiptWrapper({ token }: { token: string }) {
//   const { data, isLoading } = useSWR<PublicReceipt>(
//     `/receipts/${token}`,
//     fetcher,
//   );

//   if (isLoading) return <PageLoader />;
//   if (!data) {
//     return (
//       <Wrap>
//         <Card $accent>
//           <Title $size={20}>Receipt unavailable</Title>
//           <Text $muted>
//             This receipt may be invalid or no longer available.
//           </Text>
//         </Card>
//       </Wrap>
//     );
//   }

//   return (
//     <Wrap $gap={16}>
//       <FadeIn>
//         <Hero>
//           <Stack $gap={8}>
//             <Row $justify="space-between" $align="flex-start">
//               <Stack $gap={4}>
//                 <Title $size={24}>{data.vendorName}</Title>
//                 <Text $muted $size={13}>
//                   Order {data.orderNumber}
//                 </Text>
//               </Stack>
//               <Badge $tone="success">Paid</Badge>
//             </Row>
//           </Stack>
//         </Hero>
//       </FadeIn>

//       <Card>
//         <Stack $gap={12}>
//           <Text $weight={800}>Receipt</Text>
//           <Line>
//             <Text $muted>Amount paid</Text>
//             <Text $weight={800}>{formatKobo(data.amountPaidKobo)}</Text>
//           </Line>
//           <Line>
//             <Text $muted>Status</Text>
//             <Text>{data.paymentStatus}</Text>
//           </Line>
//           <Line>
//             <Text $muted>Date</Text>
//             <Text>{formatDateTime(data.paymentDate)}</Text>
//           </Line>
//         </Stack>
//       </Card>
//     </Wrap>
//   );
// }
