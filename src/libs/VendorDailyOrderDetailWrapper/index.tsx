"use client";

import Link from "next/link";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import styled from "styled-components";
import useSWR, { mutate as globalMutate } from "swr";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FadeIn,
  Grid,
  Input,
  PageHeader,
  Row,
  SectionHeader,
  Stack,
  StatCard,
  Text,
  Textarea,
} from "@/components";
import { PageLoader } from "@/components/Loader";
import { api } from "@/constants/api";
import { fetcher } from "@/constants/fetcher";
import {
  formatDate,
  formatDateTime,
  formatKobo,
  statusLabel,
  timeUntil,
} from "@/constants/formatters";
import {
  isBuyerHandoverEligible,
  nextVendorOrderAction,
} from "@/constants/orderLifecycle";
import {
  ORDER_CHAT_NOT_OPEN_MESSAGE,
  canSendOrderChat,
} from "@/constants/orderChat";
import { useToast } from "@/hooks/useToast";
import { OrderConversationPanel } from "@/libs/OrderConversationPanel";
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
  deliveryPhone?: string;
  customerMessage?: string;
  createdAt?: string;
  acceptanceDeadline?: string | null;
  expectedReadyAt?: string | null;
  expectedPrepMin?: number | null;
  actualPrepMin?: number | null;
  lateMarkedAt?: string | null;
  revisedReadyAt?: string | null;
  revisedPrepMin?: number | null;
  readyExtensionCount?: number | null;
  lateEscalatedAt?: string | null;
  handoverCredentialUsedAt?: string | null;
  updatedAt?: string;
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
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  padding: 14px 0;
  border-bottom: 1px solid var(--pc-border);
  &:last-child {
    border-bottom: none;
  }
  @media (max-width: 680px) {
    grid-template-columns: 1fr;
  }
`;
const IncomingMeta = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  @media (max-width: 680px) {
    align-items: flex-start;
  }
`;
const ActionPanel = styled.div`
  grid-column: 1 / -1;
  padding: 12px;
  border: 1px solid var(--pc-border);
  border-radius: var(--pc-radius-sm);
  background: var(--pc-surface-2);
  //   background: red;
`;
const BuyerNoteBox = styled.div`
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--pc-border);
  border-radius: var(--pc-radius-sm);
  background: var(--pc-surface-2);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
`;
const ActionGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(156px, 1fr));
  gap: 8px;
`;
const HandoverGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  @media (max-width: 520px) {
    grid-template-columns: 1fr;
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
    case "IN_TRANSIT":
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
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [messageOrderId, setMessageOrderId] = useState<string | null>(null);
  const [handoverMethodByOrder, setHandoverMethodByOrder] = useState<
    Record<string, "QR" | "PIN">
  >({});
  const [handoverCodeByOrder, setHandoverCodeByOrder] = useState<
    Record<string, string>
  >({});
  const [unreachableByOrder, setUnreachableByOrder] = useState<
    Record<string, { contactAttempts: string; note: string }>
  >({});
  const [estimateByOrder, setEstimateByOrder] = useState<
    Record<string, string>
  >({});

  const {
    data: order,
    isLoading,
    error,
  } = useSWR<DailyOrder>(`/daily-orders/my-orders/${orderId}`, fetcher, {
    refreshInterval: 15_000,
  });

  // Buyer orders placed against this listing. The dashboard uses a separate
  // vendor-wide attention queue so completed history can remain visible here.
  const {
    data: incoming,
    isLoading: incomingLoading,
    error: incomingError,
    mutate: mutateIncoming,
  } = useSWR<IncomingOrder[]>(
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

  function canMessageBuyer(buyerOrder: IncomingOrder) {
    return canSendOrderChat({
      status: buyerOrder.status,
      updatedAt: buyerOrder.updatedAt ?? buyerOrder.createdAt,
    });
  }

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

  async function transitionBuyerOrder(
    buyerOrder: IncomingOrder,
    status: OrderStatus,
    label: string,
  ) {
    const rejectionReason =
      status === "VENDOR_REJECTED"
        ? window.prompt(
            `Why are you rejecting order ${buyerOrder.orderNumber}?`,
          )
        : null;
    if (status === "VENDOR_REJECTED" && !rejectionReason?.trim()) return;
    setBusyOrderId(buyerOrder.id);
    try {
      await api.patch(`/vendor/orders/${buyerOrder.id}/status`, {
        status,
        ...(status === "VENDOR_REJECTED"
          ? {
              reason: rejectionReason?.trim(),
              reasonCode: "VENDOR_REJECTED",
              explanation: rejectionReason?.trim(),
            }
          : {}),
      });
      toast(label, "success");
      await Promise.all([
        mutateIncoming(),
        globalMutate(`/orders/${buyerOrder.id}`),
      ]);
    } catch (error) {
      toast(actionErr(error), "error");
    } finally {
      setBusyOrderId(null);
    }
  }

  async function reviseEstimate(buyerOrder: IncomingOrder) {
    const revisedPrepMin = Number(estimateByOrder[buyerOrder.id] ?? "");
    if (!Number.isInteger(revisedPrepMin) || revisedPrepMin < 5) {
      toast("Enter at least 5 minutes.", "error");
      return;
    }
    setBusyOrderId(buyerOrder.id);
    try {
      await api.patch(`/vendor/orders/${buyerOrder.id}/ready-estimate`, {
        revisedPrepMin,
      });
      toast("Ready time updated", "success");
      setEstimateByOrder((current) => ({
        ...current,
        [buyerOrder.id]: "",
      }));
      await Promise.all([
        mutateIncoming(),
        globalMutate(`/orders/${buyerOrder.id}`),
      ]);
    } catch (error) {
      toast(actionErr(error), "error");
    } finally {
      setBusyOrderId(null);
    }
  }

  async function confirmHandover(buyerOrder: IncomingOrder) {
    const method = handoverMethodByOrder[buyerOrder.id] ?? "QR";
    const code = handoverCodeByOrder[buyerOrder.id]?.trim();
    if (!code) {
      toast("Enter the QR code value or PIN.", "error");
      return;
    }
    setBusyOrderId(buyerOrder.id);
    try {
      await api.post(`/vendor/orders/${buyerOrder.id}/confirm-handover`, {
        method,
        code,
      });
      setHandoverCodeByOrder((current) => ({
        ...current,
        [buyerOrder.id]: "",
      }));
      toast("Handover confirmed.", "success");
      await Promise.all([
        mutateIncoming(),
        globalMutate(`/orders/${buyerOrder.id}`),
      ]);
    } catch (error) {
      toast(actionErr(error), "error");
    } finally {
      setBusyOrderId(null);
    }
  }

  async function reportNoShow(buyerOrder: IncomingOrder) {
    setBusyOrderId(buyerOrder.id);
    try {
      await api.post(`/vendor/orders/${buyerOrder.id}/pickup-no-show`, {});
      toast("No-show report sent.", "success");
      await mutateIncoming();
    } catch (error) {
      toast(actionErr(error), "error");
    } finally {
      setBusyOrderId(null);
    }
  }

  async function reportBuyerUnreachable(buyerOrder: IncomingOrder) {
    const form = unreachableByOrder[buyerOrder.id] ?? {
      contactAttempts: "1",
      note: "",
    };
    if (!form.note.trim()) {
      toast("Add a short note before reporting.", "error");
      return;
    }
    setBusyOrderId(buyerOrder.id);
    try {
      await api.post(`/vendor/orders/${buyerOrder.id}/buyer-unreachable`, {
        arrivalTime: new Date().toISOString(),
        contactAttempts: Number(form.contactAttempts || 1),
        note: form.note.trim(),
      });
      toast("Buyer-unreachable report sent.", "success");
      await mutateIncoming();
    } catch (error) {
      toast(actionErr(error), "error");
    } finally {
      setBusyOrderId(null);
    }
  }

  async function markDeliveryFailed(buyerOrder: IncomingOrder) {
    setBusyOrderId(buyerOrder.id);
    try {
      await api.post(`/vendor/orders/${buyerOrder.id}/delivery-failed`, {});
      toast("Delivery failed report sent for review.", "success");
      await mutateIncoming();
    } catch (error) {
      toast(actionErr(error), "error");
    } finally {
      setBusyOrderId(null);
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

        <Row $justify="space-between" $align="flex-start" $gap={12} $wrap>
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
          <Button as={Link} href={`/dashboard/${order.id}/edit`} $full>
            <span aria-hidden>✏️</span> Edit daily order
          </Button>
        ) : (
          <LockNote>
            <span aria-hidden>🔒</span>
            {order.status === "CLOSED" || order.status === "CANCELLED"
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
            hint={hasCapacity ? `of ${totalCapacity} capacity` : "no cap"}
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
                <Text $weight={700}>{formatDate(order.scheduledDate)}</Text>
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
                <Text $weight={700}>{formatDateTime(order.cutoffTime)}</Text>
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
                    order.deliveryAvailable && "🛵 Delivery",
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
                  cap && cap > 0 ? (it.orderedQuantity / cap) * 100 : 0;
                return (
                  <ItemRow key={it.id}>
                    <Stack $gap={4} style={{ flex: 1 }}>
                      <Text $weight={700}>{it.snapshotName}</Text>
                      {it.optionGroups.length > 0 && (
                        <Text $muted $size={12}>
                          {it.optionGroups.map((g) => g.name).join(" · ")}
                        </Text>
                      )}
                      {cap && cap > 0 && (
                        <Progress
                          aria-label={`${it.orderedQuantity} of ${cap} ordered`}>
                          <ProgressFill $pct={pct} />
                        </Progress>
                      )}
                    </Stack>
                    <Stack $gap={2} style={{ alignItems: "flex-end" }}>
                      <Text $weight={800}>
                        {formatKobo(it.snapshotPriceKobo)}
                      </Text>
                      <Text $muted $size={12}>
                        {it.orderedQuantity}
                        {cap && cap > 0 ? ` / ${cap}` : " ordered"}
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
            {incomingLoading ? (
              <Card>
                <Text $muted>Loading buyer orders...</Text>
              </Card>
            ) : incomingError ? (
              <EmptyState
                icon="!"
                title="Could not load buyer orders"
                description={actionErr(incomingError)}
                action={
                  <Button onClick={() => mutateIncoming()}>Try again</Button>
                }
              />
            ) : (incoming?.length ?? 0) === 0 ? (
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
                {(incoming ?? []).map((o) => {
                  const next = nextAction(o);
                  const nextStatus = next.status;
                  const handoverEligible = isBuyerHandoverEligible(
                    o.status,
                    o.fulfillmentType,
                    o.handoverCredentialUsedAt,
                  );
                  const busy = busyOrderId === o.id;
                  const canReviseEstimate =
                    !!o.lateMarkedAt &&
                    !handoverEligible &&
                    (o.readyExtensionCount ?? 0) < 2;
                  return (
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
                          · {o.items.reduce((n, it) => n + it.quantity, 0)}{" "}
                          item(s)
                        </Text>
                        {o.subtotalKobo != null && (
                          <Text $muted $size={12}>
                            Food {formatKobo(o.subtotalKobo)} · Commission{" "}
                            {formatKobo(o.prechopCommissionKobo ?? 0)} ·
                            Delivery {formatKobo(o.deliveryFeeKobo ?? 0)}
                          </Text>
                        )}
                        {o.fulfillmentType !== "DELIVERY" &&
                          o.customerMessage && (
                            <BuyerNoteBox>
                              <Text $size={12} $weight={800}>
                                Buyer note
                              </Text>
                              <Text $size={13}>{o.customerMessage}</Text>
                            </BuyerNoteBox>
                          )}
                        {next.countdown && (
                          <Text $muted $size={12}>
                            Acceptance countdown: {next.countdown}
                          </Text>
                        )}
                        <Text $muted $size={12}>
                          Next action: {next.label}
                        </Text>
                        {o.expectedReadyAt && (
                          <Text $muted $size={12}>
                            Expected ready:{" "}
                            {formatDateTime(
                              o.revisedReadyAt ?? o.expectedReadyAt,
                            )}
                          </Text>
                        )}
                      </Stack>
                      <IncomingMeta>
                        <Text $weight={800} $size={14}>
                          {formatKobo(o.vendorSettlementKobo ?? o.totalKobo)}
                        </Text>
                        <Text $muted $size={11}>
                          Vendor settlement
                        </Text>
                      </IncomingMeta>
                      <ActionPanel>
                        <Stack $gap={10}>
                          {o.lateMarkedAt && (
                            <BuyerNoteBox>
                              <Text $size={12} $weight={800}>
                                Running late
                              </Text>
                              <Text $size={13}>
                                Send the buyer a revised ready time. Revisions:{" "}
                                {o.readyExtensionCount ?? 0}
                                /2.
                              </Text>
                              {canReviseEstimate && (
                                <HandoverGrid>
                                  <Input
                                    label="Extra minutes"
                                    type="number"
                                    min={5}
                                    max={240}
                                    value={estimateByOrder[o.id] ?? ""}
                                    onChange={(event) =>
                                      setEstimateByOrder((current) => ({
                                        ...current,
                                        [o.id]: event.target.value,
                                      }))
                                    }
                                  />
                                  <Button
                                    $size="sm"
                                    $variant="secondary"
                                    $loading={busy}
                                    onClick={() => reviseEstimate(o)}>
                                    Update estimate
                                  </Button>
                                </HandoverGrid>
                              )}
                            </BuyerNoteBox>
                          )}
                          <ActionGrid>
                            <Button
                              $size="sm"
                              $variant="secondary"
                              disabled={!canMessageBuyer(o)}
                              title={
                                canMessageBuyer(o)
                                  ? "Message buyer"
                                  : ORDER_CHAT_NOT_OPEN_MESSAGE
                              }
                              onClick={() =>
                                setMessageOrderId(
                                  messageOrderId === o.id ? null : o.id,
                                )
                              }>
                              Message buyer
                            </Button>
                            {nextStatus && (
                              <Button
                                $size="sm"
                                $loading={busy}
                                onClick={() =>
                                  transitionBuyerOrder(
                                    o,
                                    nextStatus,
                                    next.toast,
                                  )
                                }
                                aria-label={`${next.label} for order ${o.orderNumber}`}>
                                {next.label}
                              </Button>
                            )}
                            {o.status === "AWAITING_VENDOR_ACCEPTANCE" && (
                              <Button
                                $size="sm"
                                $variant="danger"
                                $loading={busy}
                                onClick={() =>
                                  transitionBuyerOrder(
                                    o,
                                    "VENDOR_REJECTED",
                                    "Order rejected. Refund timing can depend on Paystack and the buyer's bank.",
                                  )
                                }
                                aria-label={`Reject order ${o.orderNumber}`}>
                                Reject order
                              </Button>
                            )}
                            {o.fulfillmentType === "PICKUP" &&
                              o.status === "READY" && (
                                <Button
                                  $size="sm"
                                  $variant="secondary"
                                  $loading={busy}
                                  onClick={() => reportNoShow(o)}
                                  aria-label={`Report buyer no-show for order ${o.orderNumber}`}>
                                  Buyer no-show
                                </Button>
                              )}
                            {o.status === "BUYER_UNREACHABLE_REPORTED" && (
                              <Button
                                $size="sm"
                                $variant="danger"
                                $loading={busy}
                                onClick={() => markDeliveryFailed(o)}
                                aria-label={`Mark delivery failed for order ${o.orderNumber}`}>
                                Delivery failed
                              </Button>
                            )}
                          </ActionGrid>
                          {messageOrderId === o.id && (
                            <OrderConversationPanel
                              orderId={o.id}
                              title="Message buyer"
                              autoFocus
                            />
                          )}
                          {handoverEligible && (
                            <Stack $gap={8}>
                              <Text $weight={700} $size={13}>
                                Scan QR or enter PIN
                              </Text>
                              <HandoverGrid>
                                <select
                                  value={handoverMethodByOrder[o.id] ?? "QR"}
                                  onChange={(event) =>
                                    setHandoverMethodByOrder((current) => ({
                                      ...current,
                                      [o.id]: event.target.value as
                                        | "QR"
                                        | "PIN",
                                    }))
                                  }
                                  aria-label={`Confirmation method for order ${o.orderNumber}`}>
                                  <option value="QR">QR scan</option>
                                  <option value="PIN">PIN</option>
                                </select>
                                <Input
                                  label="Code"
                                  value={handoverCodeByOrder[o.id] ?? ""}
                                  onChange={(event) =>
                                    setHandoverCodeByOrder((current) => ({
                                      ...current,
                                      [o.id]: event.target.value,
                                    }))
                                  }
                                  placeholder="Scan QR value or enter PIN"
                                  aria-label={`QR or PIN for order ${o.orderNumber}`}
                                />
                              </HandoverGrid>
                              <Button
                                $size="sm"
                                $loading={busy}
                                onClick={() => confirmHandover(o)}>
                                Confirm handover
                              </Button>
                            </Stack>
                          )}
                          {o.fulfillmentType === "DELIVERY" &&
                            o.status === "IN_TRANSIT" && (
                              <Stack $gap={8}>
                                <Text $weight={700} $size={13}>
                                  Buyer unreachable
                                </Text>
                                <HandoverGrid>
                                  <Input
                                    label="Contact attempts"
                                    type="number"
                                    min={1}
                                    max={20}
                                    value={
                                      unreachableByOrder[o.id]
                                        ?.contactAttempts ?? "1"
                                    }
                                    onChange={(event) =>
                                      setUnreachableByOrder((current) => ({
                                        ...current,
                                        [o.id]: {
                                          contactAttempts: event.target.value,
                                          note: current[o.id]?.note ?? "",
                                        },
                                      }))
                                    }
                                  />
                                  <Textarea
                                    label="Note"
                                    value={unreachableByOrder[o.id]?.note ?? ""}
                                    onChange={(event) =>
                                      setUnreachableByOrder((current) => ({
                                        ...current,
                                        [o.id]: {
                                          contactAttempts:
                                            current[o.id]?.contactAttempts ??
                                            "1",
                                          note: event.target.value,
                                        },
                                      }))
                                    }
                                    placeholder="Example: called twice at the hostel gate."
                                  />
                                </HandoverGrid>
                                <Button
                                  $size="sm"
                                  $variant="secondary"
                                  $loading={busy}
                                  onClick={() => reportBuyerUnreachable(o)}>
                                  Report unreachable
                                </Button>
                              </Stack>
                            )}
                        </Stack>
                      </ActionPanel>
                    </IncomingItem>
                  );
                })}
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
                onClick={copyLink}>
                {copied ? "Copied ✓" : "Copy"}
              </Button>
            </LinkBox>
            <ShareGrid>
              <ShareBtn
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                $bg="#25D366">
                <span aria-hidden>💬</span> WhatsApp
              </ShareBtn>
              <ShareBtn
                href={tgHref}
                target="_blank"
                rel="noopener noreferrer"
                $bg="#229ED9">
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
              $full>
              View public listing
            </Button>
          </Stack>
        </Card>
      </Stack>
    </FadeIn>
  );
}

function nextAction(order: IncomingOrder): {
  label: string;
  status?: OrderStatus;
  toast: string;
  countdown?: string;
} {
  if (order.status === "AWAITING_VENDOR_ACCEPTANCE") {
    const next = nextVendorOrderAction(order.status, order.fulfillmentType);
    return {
      label: next?.label ?? "Accept order",
      status: next?.to,
      toast: "Order accepted.",
      countdown: order.acceptanceDeadline
        ? timeUntil(order.acceptanceDeadline)
        : "respond promptly",
    };
  }
  if (order.status === "PAID")
    return {
      label: "Confirm order",
      status: "CONFIRMED",
      toast: "Order confirmed.",
    };
  if (order.status === "CONFIRMED")
    return {
      label: "Start preparing",
      status: "PREPARING",
      toast: "Order moved to preparing.",
    };
  const next = nextVendorOrderAction(order.status, order.fulfillmentType);
  if (next)
    return {
      label: next.label,
      status: next.to,
      toast:
        next.to === "COOKING"
          ? "Order moved to cooking."
          : next.to === "IN_TRANSIT"
            ? "Order marked in transit."
            : "Buyer notified that the order is ready.",
    };
  if (
    ((order.status === "READY_FOR_PICKUP" ||
      (order.status === "READY" && order.fulfillmentType === "PICKUP")) &&
      order.fulfillmentType === "PICKUP") ||
    order.status === "IN_TRANSIT"
  )
    return {
      label: "Confirm with QR/PIN",
      toast: "Use the QR/PIN form below.",
    };
  if (order.status === "BUYER_UNREACHABLE_REPORTED")
    return {
      label: "Wait for buyer response",
      toast: "Buyer response window is open.",
    };
  return {
    label: "No vendor action available",
    toast: "No action is available for this status.",
  };
}

function actionErr(e: unknown): string {
  const err = e as {
    response?: { data?: { message?: string } };
    message?: string;
  };
  return (
    err?.response?.data?.message ??
    err?.message ??
    "Something went wrong. Try again."
  );
}
