"use client";

import {
	type ComponentType,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import {
	FiCamera,
	FiCheckCircle,
	FiClock,
	FiHash,
	FiMapPin,
	FiMessageCircle,
	FiPackage,
	FiPhone,
	FiPlayCircle,
	FiTruck,
	FiXCircle,
} from "react-icons/fi";
import styled from "styled-components";
import useSWR, { mutate as globalMutate } from "swr";
import {
	Badge,
	Button,
	Card,
	EmptyState,
	FadeIn,
	Input,
	PageHeader,
	Row,
	Select,
	Skeleton,
	Stack,
	Text,
} from "@/components";
import { PageLoader } from "@/components/Loader";
import { api, apiData } from "@/constants/api";
import { fetcher } from "@/constants/fetcher";
import { formatKobo, statusLabel } from "@/constants/formatters";
import {
	canSendOrderChat,
	ORDER_CHAT_NOT_OPEN_MESSAGE,
} from "@/constants/orderChat";
import {
	canonicalOrderStatus,
	isBuyerHandoverEligible,
	nextVendorOrderAction,
} from "@/constants/orderLifecycle";
import { useToast } from "@/hooks/useToast";
import {
	hasLateOrderAck,
	rememberLateOrderAck,
} from "@/libs/lateOrderAcknowledgement";
import { OrderConversationPanel } from "@/libs/OrderConversationPanel";
import {
	OrderReasonModal,
	type OrderReasonPayload,
	VENDOR_REJECT_REASON_OPTIONS,
	VENDOR_UNABLE_REASON_OPTIONS,
} from "@/libs/OrderReasonModal";
import type { DailyOrder, OrderConversation, OrderStatus } from "@/types";

interface PipelineOrder {
	id: string;
	orderNumber: string;
	status: OrderStatus;
	fulfillmentType: "PICKUP" | "DELIVERY";
	totalKobo: number;
	deliveryHostelName?: string;
	deliveryPhoneNumber: number;
	deliveryRoomNumber?: string;
	deliveryAdditionalInfo?: string;
	deliveryFullAddress?: string;
	customerMessage?: string;
	acceptanceDeadline?: string | null;
	expectedReadyAt?: string | null;
	lateMarkedAt?: string | null;
	revisedReadyAt?: string | null;
	revisedPrepMin?: number | null;
	readyExtensionCount?: number | null;
	lateEscalatedAt?: string | null;
	createdAt?: string;
	updatedAt?: string;
	confirmedAt?: string | null;
	pickedUpAt?: string | null;
	deliveredAt?: string | null;
	handoverCredentialUsedAt?: string | null;
	items: Array<{
		snapshotName: string;
		selectedVariantName?: string;
		quantity: number;
		subtotalKobo: number;
	}>;
}

interface BuyerContactReveal {
	buyerName?: string | null;
	address?: string;
	deliveryHostelName?: string;
	deliveryRoomNumber?: string;
	deliveryAdditionalInfo?: string;
	checkoutNote?: string;
	phone?: string;
	telUrl?: string;
	whatsappUrl?: string;
	instructions?: string[];
}

function canMessageBuyer(order: PipelineOrder) {
	return canSendOrderChat({
		status: order.status,
		updatedAt: order.updatedAt,
	});
}

type CompletedFilter = "today" | "7d" | "all";
type ReasonAction = { kind: "reject" | "unable"; order: PipelineOrder };

type LaneKey =
	| "AWAITING_VENDOR_ACCEPTANCE"
	| "ACCEPTED"
	| "COOKING"
	| "READY_FOR_PICKUP"
	| "READY_FOR_DELIVERY"
	| "IN_TRANSIT";

interface BoardColumn {
	key: LaneKey;
	status: OrderStatus;
	label: string;
	empty: string;
	icon: ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
	fulfillmentType?: PipelineOrder["fulfillmentType"];
}

const COLUMNS: BoardColumn[] = [
	{
		key: "AWAITING_VENDOR_ACCEPTANCE",
		status: "AWAITING_VENDOR_ACCEPTANCE",
		label: "Awaiting acceptance",
		empty: "No orders waiting for acceptance",
		icon: FiClock,
	},
	{
		key: "ACCEPTED",
		status: "ACCEPTED",
		label: "Accepted",
		empty: "No accepted orders waiting to cook",
		icon: FiCheckCircle,
	},
	{
		key: "COOKING",
		status: "COOKING",
		label: "Cooking",
		empty: "No orders cooking right now",
		icon: FiPlayCircle,
	},
	{
		key: "READY_FOR_PICKUP",
		status: "READY_FOR_PICKUP",
		label: "Ready for pickup",
		empty: "No pickup orders ready",
		icon: FiPackage,
		fulfillmentType: "PICKUP",
	},
	{
		key: "READY_FOR_DELIVERY",
		status: "READY_FOR_DELIVERY",
		label: "Ready for delivery",
		empty: "No delivery orders ready",
		icon: FiPackage,
		fulfillmentType: "DELIVERY",
	},
	{
		key: "IN_TRANSIT",
		status: "IN_TRANSIT",
		label: "In transit",
		empty: "No delivery orders In transit",
		icon: FiTruck,
		fulfillmentType: "DELIVERY",
	},
];

const LANE_ACCENT: Record<OrderStatus, string> = {
	PENDING_PAYMENT: "var(--pc-color-gold)",
	AWAITING_EXTERNAL_PAYMENT: "var(--pc-color-gold)",
	PAID: "var(--pc-color-gold)",
	AWAITING_VENDOR_ACCEPTANCE: "var(--pc-color-gold)",
	ACCEPTED: "var(--pc-color-accent)",
	CONFIRMED: "var(--pc-color-accent)",
	PREPARING: "var(--pc-color-primary)",
	COOKING: "var(--pc-color-primary)",
	READY: "var(--pc-color-accent)",
	READY_FOR_PICKUP: "var(--pc-color-accent)",
	READY_FOR_DELIVERY: "var(--pc-color-accent)",
	IN_TRANSIT: "var(--pc-color-gold)",
	DELIVERED: "var(--pc-color-accent)",
	PICKED_UP: "var(--pc-color-accent)",
	COMPLETED: "var(--pc-color-success)",
	CANCELLED: "var(--pc-color-danger)",
	VENDOR_REJECTED: "var(--pc-color-danger)",
	EXPIRED_VENDOR_NO_RESPONSE: "var(--pc-color-danger)",
	REFUND_PENDING: "var(--pc-color-gold)",
	REFUND_PROCESSING: "var(--pc-color-gold)",
	REFUNDED: "var(--pc-color-danger)",
	REFUND_FAILED: "var(--pc-color-danger)",
	AWAITING_BUYER_NO_SHOW_RESPONSE: "var(--pc-color-gold)",
	COMPLETED_BUYER_NO_SHOW: "var(--pc-color-danger)",
	PICKUP_PROBLEM_REPORTED: "var(--pc-color-danger)",
	BUYER_UNREACHABLE_REPORTED: "var(--pc-color-danger)",
	DELIVERY_FAILED: "var(--pc-color-danger)",
};

const PipelineShell = styled.div`
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  overflow-x: clip;
`;

const Board = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--pc-space-4);
  align-items: start;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
`;

const Lane = styled.div<{ $accent: string }>`
  display: flex;
  flex-direction: column;
  gap: var(--pc-space-3);
  min-width: 0;
  max-width: 100%;
  background: var(--pc-surface-2);
  border: 1px solid var(--pc-border);
  border-radius: var(--pc-radius);
  padding: var(--pc-space-3);
  border-top: 3px solid ${(p) => p.$accent};
`;

const LaneHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--pc-space-2);
  padding: 2px var(--pc-space-1);
`;

const LaneTitle = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-family: var(--pc-font-display);
  font-weight: 700;
  font-size: 15px;
  color: var(--pc-text);
`;

const LaneIcon = styled.span`
  display: inline-flex;
  color: var(--pc-color-primary);
`;

const OrderCard = styled(Card)`
  padding: var(--pc-space-4);
  &:hover {
    box-shadow: var(--pc-shadow);
  }
`;

const OrderNumber = styled(Text)`
  overflow-wrap: anywhere;
  word-break: break-word;
  line-height: 1.15;
`;

const Countdown = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--pc-color-gold);
`;

const Divider = styled.div`
  height: 1px;
  background: var(--pc-border);
`;

const AddrLine = styled.div`
  display: flex;
  gap: 6px;
  font-size: 13px;
  color: var(--pc-text-muted);
  background: var(--pc-surface-2);
  padding: 8px 10px;
  border-radius: var(--pc-radius-sm);
`;

const BuyerNoteBox = styled.div`
  display: grid;
  gap: 4px;
  font-size: 13px;
  color: var(--pc-text);
  background: var(--pc-surface-2);
  padding: 9px 10px;
  border: 1px solid var(--pc-border);
  border-radius: var(--pc-radius-sm);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
`;

const LateNotice = styled.div`
  display: grid;
  gap: 4px;
  padding: 9px 10px;
  border: 1px solid rgba(229, 72, 77, 0.34);
  border-radius: var(--pc-radius-sm);
  background: var(--pc-color-danger-50);
  color: var(--pc-color-danger-ink);
`;

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1400;
  display: grid;
  place-items: center;
  padding: var(--pc-space-4);
  background: rgba(20, 16, 12, 0.62);

  @media (max-width: 640px) {
    align-items: end;
    padding: 0;
  }
`;

const LateSheet = styled.div`
  width: min(100%, 460px);
  max-height: min(86dvh, 620px);
  overflow: auto;
  border: 1px solid var(--pc-border);
  border-radius: var(--pc-radius-lg);
  background: var(--pc-surface);
  box-shadow: var(--pc-shadow-lg);
  padding: var(--pc-space-5);

  @media (max-width: 640px) {
    width: 100%;
    border-radius: 22px 22px 0 0;
    padding: var(--pc-space-4);
  }
`;

const HandoverSheet = styled(LateSheet)`
  width: min(100%, 520px);
`;

const Segmented = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;

  @media (max-width: 420px) {
    grid-template-columns: 1fr;
  }
`;

const CameraPreview = styled.video`
  width: 100%;
  aspect-ratio: 4 / 3;
  border-radius: var(--pc-radius-sm);
  background: #000;
  object-fit: cover;
`;

const ModalActions = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;

  @media (max-width: 420px) {
    grid-template-columns: 1fr;
  }
`;

const ContactBox = styled.div`
  display: grid;
  gap: 8px;
  font-size: 13px;
  color: var(--pc-text);
  background: var(--pc-surface-2);
  padding: 9px 10px;
  border: 1px solid var(--pc-border);
  border-radius: var(--pc-radius-sm);
`;

const ContactLinks = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const ContactLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 6px 10px;
  border-radius: var(--pc-radius-sm);
  border: 1px solid var(--pc-border);
  color: var(--pc-text);
  font-weight: 800;
  text-decoration: none;
`;

const LaneEmpty = styled.div`
  text-align: center;
  font-size: 13px;
  color: var(--pc-text-faint);
  padding: var(--pc-space-4) var(--pc-space-2);
  border: 1.5px dashed var(--pc-border);
  border-radius: var(--pc-radius-sm);
`;
const HistoryPanel = styled(Card)`
  padding: var(--pc-space-4);
`;
const FilterRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;
const FilterButton = styled.button<{ $active: boolean }>`
  border: 1px solid
    ${(p) => (p.$active ? "var(--pc-color-primary)" : "var(--pc-border)")};
  background: ${(p) =>
		p.$active ? "var(--pc-color-primary-50)" : "var(--pc-surface-2)"};
  color: ${(p) =>
		p.$active ? "var(--pc-color-primary)" : "var(--pc-text-muted)"};
  border-radius: 999px;
  padding: 7px 12px;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
`;
const HistoryList = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--pc-space-3);
`;

function statusTone(
	status: OrderStatus,
): "primary" | "success" | "warning" | "danger" | "muted" {
	switch (status) {
		case "PAID":
		case "AWAITING_VENDOR_ACCEPTANCE":
		case "REFUND_PENDING":
		case "REFUND_PROCESSING":
		case "AWAITING_BUYER_NO_SHOW_RESPONSE":
			return "warning";
		case "ACCEPTED":
		case "COOKING":
		case "READY":
		case "READY_FOR_PICKUP":
		case "READY_FOR_DELIVERY":
		case "IN_TRANSIT":
		case "PICKED_UP":
		case "DELIVERED":
		case "COMPLETED":
			return "success";
		case "CANCELLED":
		case "REFUNDED":
		case "VENDOR_REJECTED":
		case "EXPIRED_VENDOR_NO_RESPONSE":
		case "REFUND_FAILED":
		case "COMPLETED_BUYER_NO_SHOW":
		case "DELIVERY_FAILED":
			return "danger";
		default:
			return "primary";
	}
}

function errMsg(e: unknown): string {
	const message = (e as { response?: { data?: { message?: string } } })
		?.response?.data?.message;
	return message ?? "Something went wrong. Please try again.";
}

function orderBelongsInColumn(order: PipelineOrder, column: BoardColumn) {
	if (
		canonicalOrderStatus(order.status, order.fulfillmentType) !==
		column.status
	)
		return false;
	if (
		column.fulfillmentType &&
		order.fulfillmentType !== column.fulfillmentType
	) {
		return false;
	}
	return true;
}

function actionForOrder(
	order: PipelineOrder,
): { to: OrderStatus; label: string } | undefined {
	return (
		nextVendorOrderAction(order.status, order.fulfillmentType) ?? undefined
	);
}

function acceptanceCountdown(deadline?: string | null, now = Date.now()) {
	if (!deadline) return null;
	const ms = new Date(deadline).getTime() - now;
	if (!Number.isFinite(ms)) return null;
	if (ms <= 0) return "Acceptance overdue";
	const minutes = Math.floor(ms / 60_000);
	const seconds = Math.floor((ms % 60_000) / 1000);
	return `${minutes}:${String(seconds).padStart(2, "0")} left`;
}

function actionIcon(status: OrderStatus) {
	switch (status) {
		case "ACCEPTED":
		case "COMPLETED":
			return FiCheckCircle;
		case "COOKING":
			return FiPlayCircle;
		case "READY":
		case "READY_FOR_PICKUP":
		case "READY_FOR_DELIVERY":
			return FiPackage;
		case "IN_TRANSIT":
			return FiTruck;
		case "DELIVERED":
			return FiMapPin;
		default:
			return FiClock;
	}
}

function deliveryAddress(order: PipelineOrder) {
	return (
		order.deliveryFullAddress ||
		[
			order.deliveryHostelName,
			order.deliveryRoomNumber,
			order.deliveryAdditionalInfo,
			order.deliveryPhoneNumber,
		]
			.filter(Boolean)
			.join(", ") ||
		"No address"
	);
}

function completedAt(order: PipelineOrder) {
	return (
		order.confirmedAt ??
		order.deliveredAt ??
		order.pickedUpAt ??
		order.updatedAt ??
		order.createdAt
	);
}

function completedOrderMatchesFilter(
	order: PipelineOrder,
	filter: CompletedFilter,
	now = Date.now(),
) {
	if (filter === "all") return true;
	const value = completedAt(order);
	if (!value) return true;
	const time = new Date(value).getTime();
	if (!Number.isFinite(time)) return true;
	const start = new Date(now);
	if (filter === "today") {
		start.setHours(0, 0, 0, 0);
		return time >= start.getTime();
	}
	return time >= now - 7 * 24 * 60 * 60 * 1000;
}

function readyStatusFor(order: PipelineOrder): OrderStatus {
	return order.fulfillmentType === "DELIVERY"
		? "READY_FOR_DELIVERY"
		: "READY_FOR_PICKUP";
}

function pluralizeOrder(count: number) {
	return count === 1 ? "order" : "orders";
}

function fulfillmentQueueLabel(dailyOrder: DailyOrder) {
	const activeCount = dailyOrder.activeBuyerOrdersCount ?? 0;
	if (dailyOrder.status === "CLOSED" && activeCount > 0) {
		return `Closed to new orders · ${activeCount} active ${pluralizeOrder(activeCount)} remaining`;
	}
	return null;
}

export default function PipelineWrapper() {
	const { toast } = useToast();
	const { data: dailyOrders, isLoading } = useSWR<DailyOrder[]>(
		"/daily-orders/my-orders?status=ACTIVE&includeFulfillmentQueue=1&limit=50",
		fetcher,
	);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [busyId, setBusyId] = useState<string | null>(null);
	const [contactBusyId, setContactBusyId] = useState<string | null>(null);
	const [buyerContacts, setBuyerContacts] = useState<
		Record<string, BuyerContactReveal>
	>({});
	const [now, setNow] = useState(() => Date.now());
	const [completedFilter, setCompletedFilter] =
		useState<CompletedFilter>("today");
	const [lateModalOrderId, setLateModalOrderId] = useState<string | null>(
		null,
	);
	const [messageOrderId, setMessageOrderId] = useState<string | null>(null);
	const [handoverOrder, setHandoverOrder] = useState<PipelineOrder | null>(
		null,
	);
	const [handoverMode, setHandoverMode] = useState<"QR" | "PIN" | "PASTE">(
		"QR",
	);
	const [handoverCode, setHandoverCode] = useState("");
	const [handoverStatus, setHandoverStatus] = useState<
		"idle" | "scanning" | "loading" | "success" | "error"
	>("idle");
	const [handoverError, setHandoverError] = useState<string | null>(null);
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const [estimateByOrder, setEstimateByOrder] = useState<
		Record<string, string>
	>({});
	const [reasonAction, setReasonAction] = useState<ReasonAction | null>(null);
	const [reasonError, setReasonError] = useState<string | null>(null);
	const { data: conversations } = useSWR<OrderConversation[]>(
		"/order-conversations?limit=100",
		fetcher,
		{ refreshInterval: 15_000 },
	);

	useEffect(() => {
		const timer = window.setInterval(() => setNow(Date.now()), 1000);
		return () => window.clearInterval(timer);
	}, []);

	const active = dailyOrders ?? [];
	const currentId = selectedId ?? active[0]?.id ?? null;
	const currentDailyOrder =
		active.find((dailyOrder) => dailyOrder.id === currentId) ?? null;
	const currentFulfillmentLabel = currentDailyOrder
		? fulfillmentQueueLabel(currentDailyOrder)
		: null;

	const {
		data: orders,
		isLoading: ordersLoading,
		mutate,
	} = useSWR<PipelineOrder[]>(
		currentId ? `/vendor/daily-orders/${currentId}/orders` : null,
		fetcher,
		{ refreshInterval: 15_000 },
	);
	const list = orders ?? [];
	const lateModalOrder =
		list.find((order) => order.id === lateModalOrderId) ?? null;

	useEffect(() => {
		if (lateModalOrderId || list.length === 0) return;
		const nextLate = list.find(
			(order) =>
				!!order.lateMarkedAt &&
				!order.handoverCredentialUsedAt &&
				canMessageBuyer(order) &&
				COLUMNS.some((column) => orderBelongsInColumn(order, column)) &&
				!hasLateOrderAck("vendor", order.id),
		);
		if (nextLate) setLateModalOrderId(nextLate.id);
	}, [lateModalOrderId, list]);

	async function advance(order: PipelineOrder) {
		const next = actionForOrder(order);
		if (!next) return;
		setBusyId(order.id);
		try {
			await api.patch(`/vendor/orders/${order.id}/status`, {
				status: next.to,
			});
			toast(
				`Order ${order.orderNumber} -> ${statusLabel(next.to)}`,
				"success",
			);
			await Promise.all([
				mutate(),
				globalMutate("/vendor/orders/incoming"),
				globalMutate(`/orders/${order.id}`),
			]);
		} catch (e) {
			toast(errMsg(e), "error");
		} finally {
			setBusyId(null);
		}
	}

	function openReasonAction(kind: ReasonAction["kind"], order: PipelineOrder) {
		setReasonError(null);
		setReasonAction({ kind, order });
	}

	async function submitReasonAction(payload: OrderReasonPayload) {
		if (!reasonAction) return;
		const { kind, order } = reasonAction;
		setBusyId(order.id);
		setReasonError(null);
		try {
			if (kind === "reject") {
				await api.patch(`/vendor/orders/${order.id}/status`, {
					status: "VENDOR_REJECTED",
					reason: payload.reason,
					reasonCode: payload.reasonCode,
					explanation: payload.explanation,
				});
				toast("Order rejected. Refund started.", "success");
			} else {
				await api.post(`/vendor/orders/${order.id}/cancel`, {
					reason: payload.reason,
					reasonCode: payload.reasonCode,
					explanation: payload.explanation,
				});
				toast(
					"Order cancellation sent. Refund handling has started.",
					"success",
				);
				dismissLateModal(order);
			}
			setReasonAction(null);
			await Promise.all([
				mutate(),
				globalMutate("/vendor/orders/incoming"),
				globalMutate(`/orders/${order.id}`),
			]);
		} catch (e) {
			const message = errMsg(e);
			setReasonError(message);
			toast(message, "error");
		} finally {
			setBusyId(null);
		}
	}

	async function revealBuyerContact(order: PipelineOrder) {
		setContactBusyId(order.id);
		try {
			const data = await apiData<BuyerContactReveal>(
				api.post(`/vendor/orders/${order.id}/contact/buyer`),
			);
			setBuyerContacts((current) => ({ ...current, [order.id]: data }));
		} catch (e) {
			toast(errMsg(e), "error");
		} finally {
			setContactBusyId(null);
		}
	}

	const stopScanner = useCallback(() => {
		streamRef.current?.getTracks().forEach((track) => {
			track.stop();
		});
		streamRef.current = null;
		if (videoRef.current) videoRef.current.srcObject = null;
	}, []);

	function openHandover(order: PipelineOrder, mode: "QR" | "PIN" | "PASTE") {
		setHandoverOrder(order);
		setHandoverMode(mode);
		setHandoverCode("");
		setHandoverError(null);
		setHandoverStatus("idle");
	}

	const closeHandover = useCallback(() => {
		stopScanner();
		setHandoverOrder(null);
		setHandoverCode("");
		setHandoverError(null);
		setHandoverStatus("idle");
	}, [stopScanner]);

	const submitHandover = useCallback(
		async (order: PipelineOrder, method: "QR" | "PIN", code: string) => {
			const trimmed = code.trim();
			if (!trimmed) {
				setHandoverError(
					method === "PIN"
						? "Enter the buyer PIN."
						: "Scan or paste the buyer QR value.",
				);
				setHandoverStatus("error");
				return;
			}
			setBusyId(order.id);
			setHandoverStatus("loading");
			setHandoverError(null);
			try {
				await api.post(`/vendor/orders/${order.id}/confirm-handover`, {
					method,
					code: trimmed,
				});
				setHandoverStatus("success");
				toast("Handover confirmed.", "success");
				closeHandover();
				await Promise.all([
					mutate(),
					globalMutate("/vendor/orders/incoming"),
					globalMutate(`/orders/${order.id}`),
				]);
			} catch (e) {
				const message = errMsg(e);
				setHandoverStatus("error");
				setHandoverError(message);
				toast(message, "error");
			} finally {
				setBusyId(null);
			}
		},
		[closeHandover, mutate, toast],
	);

	useEffect(() => {
		if (!handoverOrder || handoverMode !== "QR") {
			stopScanner();
			return;
		}
		const order = handoverOrder;
		let cancelled = false;
		let timer: number | undefined;
		async function scan() {
			const BarcodeDetectorCtor = (
				window as unknown as {
					BarcodeDetector?: new (options?: {
						formats?: string[];
					}) => {
						detect: (
							video: HTMLVideoElement,
						) => Promise<Array<{ rawValue?: string }>>;
					};
				}
			).BarcodeDetector;
			if (!BarcodeDetectorCtor || !navigator.mediaDevices?.getUserMedia) {
				setHandoverStatus("error");
				setHandoverError(
					"Camera scanning is not available on this device. Enter PIN or paste the QR value instead.",
				);
				return;
			}
			try {
				setHandoverStatus("scanning");
				const stream = await navigator.mediaDevices.getUserMedia({
					video: { facingMode: "environment" },
				});
				if (cancelled) {
					stream.getTracks().forEach((track) => {
						track.stop();
					});
					return;
				}
				streamRef.current = stream;
				if (videoRef.current) {
					videoRef.current.srcObject = stream;
					await videoRef.current.play();
				}
				const detector = new BarcodeDetectorCtor({
					formats: ["qr_code"],
				});
				const tick = async () => {
					if (cancelled || !videoRef.current) return;
					const [result] = await detector.detect(videoRef.current);
					if (result?.rawValue) {
						await submitHandover(order, "QR", result.rawValue);
						return;
					}
					timer = window.setTimeout(tick, 350);
				};
				timer = window.setTimeout(tick, 350);
			} catch {
				setHandoverStatus("error");
				setHandoverError(
					"Could not open the camera. Enter PIN or paste the QR value instead.",
				);
			}
		}
		scan();
		return () => {
			cancelled = true;
			if (timer) window.clearTimeout(timer);
			stopScanner();
		};
	}, [handoverOrder, handoverMode, stopScanner, submitHandover]);

	if (isLoading) return <PageLoader />;

	if (active.length === 0) {
		return (
			<FadeIn>
				<PipelineShell>
					<Stack $gap={20}>
						<PageHeader
							eyebrow="Live kitchen"
							title="Cooking"
							subtitle="Move orders across the board as you cook and hand off."
						/>
						<EmptyState
							icon={<FiPackage size={28} aria-hidden />}
							title="No active daily orders"
							description="Post a daily order to start receiving and cooking orders."
						/>
					</Stack>
				</PipelineShell>
			</FadeIn>
		);
	}

	const completedOrders = list.filter(
		(order) => order.status === "COMPLETED",
	);
	const filteredCompletedOrders = completedOrders
		.filter((order) =>
			completedOrderMatchesFilter(order, completedFilter, now),
		)
		.slice(0, completedFilter === "all" ? 24 : 6);
	const boardCount = list.filter((order) =>
		COLUMNS.some((column) => orderBelongsInColumn(order, column)),
	).length;
	const liveCount = list.filter((order) =>
		COLUMNS.some((column) => orderBelongsInColumn(order, column)),
	).length;
	const unreadByOrder = new Map(
		(conversations ?? []).map((conversation) => [
			conversation.orderId,
			conversation.unreadCount,
		]),
	);

	function dismissLateModal(order: PipelineOrder) {
		rememberLateOrderAck("vendor", order.id);
		setLateModalOrderId(null);
	}

	function openBuyerMessages(order: PipelineOrder) {
		if (!canMessageBuyer(order)) {
			toast(ORDER_CHAT_NOT_OPEN_MESSAGE, "error");
			return;
		}
		setMessageOrderId(order.id);
		dismissLateModal(order);
	}

	async function markReady(order: PipelineOrder) {
		setBusyId(order.id);
		try {
			const intermediateStatuses: OrderStatus[] =
				order.status === "ACCEPTED"
					? ["COOKING"]
					: order.status === "CONFIRMED"
						? ["PREPARING"]
						: [];
			for (const status of intermediateStatuses) {
				await api.patch(`/vendor/orders/${order.id}/status`, {
					status,
				});
			}
			await api.patch(`/vendor/orders/${order.id}/status`, {
				status: readyStatusFor(order),
			});
			toast("Order marked ready.", "success");
			dismissLateModal(order);
			await Promise.all([
				mutate(),
				globalMutate("/vendor/orders/incoming"),
				globalMutate(`/orders/${order.id}`),
			]);
		} catch (e) {
			toast(errMsg(e), "error");
		} finally {
			setBusyId(null);
		}
	}

	async function reviseEstimate(order: PipelineOrder) {
		const revisedPrepMin = Number(estimateByOrder[order.id] ?? "");
		if (!Number.isInteger(revisedPrepMin) || revisedPrepMin < 5) {
			toast("Enter at least 5 minutes.", "error");
			return;
		}
		setBusyId(order.id);
		try {
			await api.patch(`/vendor/orders/${order.id}/ready-estimate`, {
				revisedPrepMin,
			});
			toast("Ready time updated.", "success");
			setEstimateByOrder((current) => ({ ...current, [order.id]: "" }));
			dismissLateModal(order);
			await Promise.all([
				mutate(),
				globalMutate("/vendor/orders/incoming"),
				globalMutate(`/orders/${order.id}`),
			]);
		} catch (e) {
			toast(errMsg(e), "error");
		} finally {
			setBusyId(null);
		}
	}

	async function reportUnableToComplete(order: PipelineOrder) {
		openReasonAction("unable", order);
	}

	return (
		<FadeIn>
			<PipelineShell>
				<OrderReasonModal
					open={!!reasonAction}
					title={
						reasonAction?.kind === "reject"
							? "Reject order"
							: "Unable to complete"
					}
					description={
						reasonAction?.kind === "reject"
							? `Choose why you cannot accept order ${reasonAction.order.orderNumber}.`
							: `Choose why order ${reasonAction?.order.orderNumber ?? ""} cannot be completed.`
					}
					consequence={
						reasonAction?.kind === "reject"
							? "The buyer will be told the kitchen rejected the order and refund handling will start."
							: "The buyer will be told the kitchen cancelled the order and refund handling will start."
					}
					confirmLabel={
						reasonAction?.kind === "reject"
							? "Reject order"
							: "Confirm cancellation"
					}
					options={
						reasonAction?.kind === "reject"
							? VENDOR_REJECT_REASON_OPTIONS
							: VENDOR_UNABLE_REASON_OPTIONS
					}
					loading={!!reasonAction && busyId === reasonAction.order.id}
					error={reasonError}
					onCancel={() => {
						if (busyId) return;
						setReasonAction(null);
						setReasonError(null);
					}}
					onConfirm={submitReasonAction}
				/>
				{lateModalOrder && (
					<ModalOverlay
						role="presentation"
						onClick={() => dismissLateModal(lateModalOrder)}
					>
						<LateSheet
							role="dialog"
							aria-modal="true"
							aria-labelledby="vendor-late-order-title"
							onClick={(event) => event.stopPropagation()}
						>
							<Stack $gap={14}>
								<Stack $gap={6}>
									<Badge $tone="danger">Running late</Badge>
									<Text
										id="vendor-late-order-title"
										$weight={900}
										$size={22}
									>
										Expected ready time has passed
									</Text>
									<Text $muted>
										Order #{lateModalOrder.orderNumber} is
										now late. Let the buyer know what is
										happening by marking it ready, adding a
										revised estimate, or reporting that you
										cannot complete it.
									</Text>
								</Stack>
								{lateModalOrder.expectedReadyAt && (
									<Text $muted $size={13}>
										Expected ready:{" "}
										{new Date(
											lateModalOrder.expectedReadyAt,
										).toLocaleString()}
									</Text>
								)}
								<Stack $gap={8}>
									<Row $gap={8} $align="end" $wrap>
										<div style={{ flex: "1 1 180px" }}>
											<Select
												value={
													estimateByOrder[
														lateModalOrder.id
													] ?? ""
												}
												onChange={(event) =>
													setEstimateByOrder(
														(current) => ({
															...current,
															[lateModalOrder.id]:
																event.target
																	.value,
														}),
													)
												}
												aria-label="Revised ready estimate"
											>
												<option value="">
													Choose extra time
												</option>
												<option value="5">
													5 minutes
												</option>
												<option value="10">
													10 minutes
												</option>
												<option value="15">
													15 minutes
												</option>
												<option value="20">
													20 minutes
												</option>
												<option value="30">
													30 minutes
												</option>
											</Select>
										</div>
										<Button
											$variant="secondary"
											$loading={
												busyId === lateModalOrder.id
											}
											onClick={() =>
												reviseEstimate(lateModalOrder)
											}
										>
											Add estimate
										</Button>
									</Row>
									<ModalActions>
										<Button
											$loading={
												busyId === lateModalOrder.id
											}
											onClick={() =>
												markReady(lateModalOrder)
											}
										>
											Mark ready
										</Button>
										<Button
											$variant="danger"
											$loading={
												busyId === lateModalOrder.id
											}
											onClick={() =>
												reportUnableToComplete(
													lateModalOrder,
												)
											}
										>
											Unable to complete
										</Button>
									</ModalActions>
									<Button
										$variant="secondary"
										onClick={() =>
											openBuyerMessages(lateModalOrder)
										}
									>
										<FiMessageCircle
											size={14}
											aria-hidden
										/>{" "}
										Message buyer
									</Button>
									<Button
										$variant="ghost"
										onClick={() =>
											dismissLateModal(lateModalOrder)
										}
									>
										Dismiss
									</Button>
								</Stack>
							</Stack>
						</LateSheet>
					</ModalOverlay>
				)}
				{handoverOrder && (
					<ModalOverlay role="presentation" onClick={closeHandover}>
						<HandoverSheet
							role="dialog"
							aria-modal="true"
							aria-labelledby="handover-title"
							onClick={(event) => event.stopPropagation()}
						>
							<Stack $gap={14}>
								<Stack $gap={6}>
									<Badge $tone="primary">
										Confirm handover
									</Badge>
									<Text
										id="handover-title"
										$weight={900}
										$size={22}
									>
										Order #{handoverOrder.orderNumber}
									</Text>
									<Text $muted>
										Scan the buyer's Prechop QR code, enter
										the PIN instead, or paste the QR value
										if scanning is unavailable.
									</Text>
								</Stack>
								<Segmented>
									<Button
										type="button"
										$variant={
											handoverMode === "QR"
												? "primary"
												: "secondary"
										}
										onClick={() => setHandoverMode("QR")}
									>
										<FiCamera size={14} aria-hidden /> Scan
										QR code
									</Button>
									<Button
										type="button"
										$variant={
											handoverMode === "PIN"
												? "primary"
												: "secondary"
										}
										onClick={() => setHandoverMode("PIN")}
									>
										<FiHash size={14} aria-hidden /> Enter
										PIN instead
									</Button>
									<Button
										type="button"
										$variant={
											handoverMode === "PASTE"
												? "primary"
												: "secondary"
										}
										onClick={() => setHandoverMode("PASTE")}
									>
										Paste QR value
									</Button>
								</Segmented>
								{handoverMode === "QR" ? (
									<Stack $gap={8}>
										<CameraPreview
											ref={videoRef}
											muted
											playsInline
										/>
										<Text $muted $size={13}>
											{handoverStatus === "scanning"
												? "Looking for a Prechop QR code..."
												: "Camera scanning starts automatically when supported."}
										</Text>
									</Stack>
								) : (
									<Input
										label={
											handoverMode === "PIN"
												? "Buyer PIN"
												: "QR value"
										}
										type={
											handoverMode === "PIN"
												? "tel"
												: "text"
										}
										inputMode={
											handoverMode === "PIN"
												? "numeric"
												: "text"
										}
										pattern={
											handoverMode === "PIN"
												? "[0-9]*"
												: undefined
										}
										maxLength={
											handoverMode === "PIN" ? 6 : 256
										}
										value={handoverCode}
										onChange={(event) =>
											setHandoverCode(
												handoverMode === "PIN"
													? event.target.value.replace(
															/\D/g,
															"",
														)
													: event.target.value,
											)
										}
										error={handoverError}
									/>
								)}
								{handoverMode === "QR" && handoverError && (
									<Text $size={13} $weight={800}>
										{handoverError}
									</Text>
								)}
								{handoverStatus === "success" && (
									<Badge $tone="success">
										Handover confirmed
									</Badge>
								)}
								<ModalActions>
									<Button
										type="button"
										$loading={
											busyId === handoverOrder.id ||
											handoverStatus === "loading"
										}
										onClick={() =>
											submitHandover(
												handoverOrder,
												handoverMode === "PIN"
													? "PIN"
													: "QR",
												handoverCode,
											)
										}
										disabled={handoverMode === "QR"}
									>
										Confirm handover
									</Button>
									<Button
										type="button"
										$variant="secondary"
										onClick={closeHandover}
									>
										Cancel
									</Button>
								</ModalActions>
							</Stack>
						</HandoverSheet>
					</ModalOverlay>
				)}
				<Stack $gap={20}>
					<PageHeader
						eyebrow="Live kitchen"
						title="Cooking"
						subtitle="Move orders across the board as you cook and hand off."
						actions={
							liveCount > 0 ? (
								<Badge $tone="primary">
									<FiClock size={14} aria-hidden />{" "}
									{liveCount} live
								</Badge>
							) : undefined
						}
					/>

					<Select
						value={currentId ?? ""}
						onChange={(event) => setSelectedId(event.target.value)}
					>
						{active.map((dailyOrder) => (
							<option key={dailyOrder.id} value={dailyOrder.id}>
								{dailyOrder.title} -{" "}
								{fulfillmentQueueLabel(dailyOrder) ??
									`${dailyOrder.totalOrdersCount} ${pluralizeOrder(
										dailyOrder.totalOrdersCount,
									)}`}
							</option>
						))}
					</Select>
					{currentFulfillmentLabel && (
						<Badge $tone="warning">{currentFulfillmentLabel}</Badge>
					)}

					{ordersLoading ? (
						<Board>
							{COLUMNS.map((column) => (
								<Lane
									key={column.key}
									$accent={LANE_ACCENT[column.status]}
								>
									<LaneHead>
										<LaneTitle>
											<LaneIcon>
												<column.icon
													size={16}
													aria-hidden
												/>
											</LaneIcon>
											{column.label}
										</LaneTitle>
									</LaneHead>
									<OrderCard>
										<Stack $gap={10}>
											<Skeleton $w="55%" $h={14} />
											<Skeleton $w="80%" $h={12} />
											<Skeleton $w="40%" $h={12} />
										</Stack>
									</OrderCard>
								</Lane>
							))}
						</Board>
					) : boardCount === 0 ? (
						<EmptyState
							icon={<FiClock size={28} aria-hidden />}
							title="No orders to cook yet"
							description="Paid orders will appear here as buyers order."
						/>
					) : (
						<Board>
							{COLUMNS.map((column) => {
								const columnOrders = list.filter((order) =>
									orderBelongsInColumn(order, column),
								);
								return (
									<Lane
										key={column.key}
										$accent={LANE_ACCENT[column.status]}
									>
										<LaneHead>
											<LaneTitle>
												<LaneIcon>
													<column.icon
														size={16}
														aria-hidden
													/>
												</LaneIcon>
												{column.label}
											</LaneTitle>
											<Badge
												$tone={statusTone(
													column.status,
												)}
											>
												{columnOrders.length}
											</Badge>
										</LaneHead>

										{columnOrders.length === 0 ? (
											<LaneEmpty>
												{column.empty}
											</LaneEmpty>
										) : (
											columnOrders.map((order) => {
												const next =
													actionForOrder(order);
												const NextIcon = next
													? actionIcon(next.to)
													: null;
												const handoverEligible =
													isBuyerHandoverEligible(
														order.status,
														order.fulfillmentType,
														order.handoverCredentialUsedAt,
													);
												const countdown =
													acceptanceCountdown(
														order.acceptanceDeadline,
														now,
													);
												const acceptanceOverdue =
													order.status ===
														"AWAITING_VENDOR_ACCEPTANCE" &&
													!!order.acceptanceDeadline &&
													new Date(
														order.acceptanceDeadline,
													).getTime() <= now;
												const buyerContact =
													buyerContacts[order.id];
												const checkoutNote =
													buyerContact?.checkoutNote ??
													order.customerMessage;
												const checkoutNoteLabel =
													order.fulfillmentType ===
													"DELIVERY"
														? "Delivery instructions"
														: "Checkout note";
												const showCheckoutNote =
													order.fulfillmentType !==
														"DELIVERY" ||
													!!buyerContact;
												const redactedAddress =
													order.status ===
													"AWAITING_VENDOR_ACCEPTANCE"
														? "Accept order to view delivery address"
														: "Reveal buyer details to view address";
												const cardAddress =
													buyerContact?.address ||
													(deliveryAddress(order) ===
													"No address"
														? redactedAddress
														: deliveryAddress(
																order,
															));

												return (
													<OrderCard key={order.id}>
														<Stack $gap={10}>
															<Row
																$justify="space-between"
																$align="flex-start"
																$gap={10}
															>
																<Stack $gap={4}>
																	<OrderNumber
																		$weight={
																			700
																		}
																	>
																		#
																		{
																			order.orderNumber
																		}
																	</OrderNumber>
																	<Badge
																		$tone={
																			order.fulfillmentType ===
																			"DELIVERY"
																				? "primary"
																				: "muted"
																		}
																	>
																		{order.fulfillmentType ===
																		"DELIVERY" ? (
																			<>
																				<FiTruck
																					size={
																						14
																					}
																					aria-hidden
																				/>{" "}
																				Delivery
																			</>
																		) : (
																			<>
																				<FiPackage
																					size={
																						14
																					}
																					aria-hidden
																				/>{" "}
																				Pickup
																			</>
																		)}
																	</Badge>
																	{order.status ===
																		"AWAITING_VENDOR_ACCEPTANCE" &&
																		countdown && (
																			<Countdown>
																				<FiClock
																					size={
																						13
																					}
																					aria-hidden
																				/>
																				{
																					countdown
																				}
																			</Countdown>
																		)}
																	{order.lateMarkedAt && (
																		<LateNotice>
																			<Text
																				$size={
																					12
																				}
																				$weight={
																					900
																				}
																			>
																				Running
																				late
																			</Text>
																			<Text
																				$size={
																					12
																				}
																			>
																				Add
																				a
																				revised
																				estimate
																				or
																				mark
																				this
																				order
																				ready.
																			</Text>
																		</LateNotice>
																	)}
																	{(unreadByOrder.get(
																		order.id,
																	) ?? 0) >
																		0 && (
																		<Badge $tone="primary">
																			{unreadByOrder.get(
																				order.id,
																			)}{" "}
																			unread
																		</Badge>
																	)}
																</Stack>
																<Text
																	$weight={
																		800
																	}
																>
																	{formatKobo(
																		order.totalKobo,
																	)}
																</Text>
															</Row>

															<Divider />

															<Stack $gap={3}>
																{order.items.map(
																	(
																		item,
																		index,
																	) => (
																		<Row
																			key={
																				index
																			}
																			$gap={
																				8
																			}
																			$align="baseline"
																		>
																			<Text
																				$size={
																					14
																				}
																				$weight={
																					700
																				}
																			>
																				{
																					item.quantity
																				}
																				x
																			</Text>
																			<Text
																				$size={
																					14
																				}
																			>
																				{
																					item.snapshotName
																				}
																			</Text>
																			{item.selectedVariantName && (
																				<Text
																					$muted
																					$size={
																						12
																					}
																				>
																					{
																						item.selectedVariantName
																					}
																				</Text>
																			)}
																		</Row>
																	),
																)}
															</Stack>

															{order.fulfillmentType ===
																"DELIVERY" && (
																<AddrLine>
																	<FiMapPin
																		size={
																			14
																		}
																		aria-hidden
																	/>
																	<span>
																		{
																			cardAddress
																		}
																	</span>
																</AddrLine>
															)}

															{order.fulfillmentType ===
																"DELIVERY" &&
																buyerContact && (
																	<ContactBox>
																		{buyerContact.buyerName && (
																			<Text
																				$size={
																					13
																				}
																				$weight={
																					900
																				}
																			>
																				{
																					buyerContact.buyerName
																				}
																			</Text>
																		)}
																		{buyerContact.address && (
																			<Text
																				$size={
																					13
																				}
																			>
																				Address:{" "}
																				{
																					buyerContact.address
																				}
																			</Text>
																		)}
																		{buyerContact.deliveryRoomNumber && (
																			<Text
																				$muted
																				$size={
																					12
																				}
																			>
																				Room:{" "}
																				{
																					buyerContact.deliveryRoomNumber
																				}
																			</Text>
																		)}
																		{buyerContact.deliveryAdditionalInfo && (
																			<Text
																				$muted
																				$size={
																					12
																				}
																			>
																				Landmark:{" "}
																				{
																					buyerContact.deliveryAdditionalInfo
																				}
																			</Text>
																		)}
																		{buyerContact.phone && (
																			<Row
																				$gap={
																					8
																				}
																				$align="center"
																				$wrap
																			>
																				<FiPhone
																					size={
																						14
																					}
																					aria-hidden
																				/>
																				<Text
																					$size={
																						13
																					}
																					$weight={
																						800
																					}
																				>
																					{
																						buyerContact.phone
																					}
																				</Text>
																			</Row>
																		)}
																		<ContactLinks>
																			{buyerContact.telUrl && (
																				<ContactLink
																					href={
																						buyerContact.telUrl
																					}
																				>
																					<FiPhone
																						size={
																							13
																						}
																						aria-hidden
																					/>
																					Call
																				</ContactLink>
																			)}
																			{buyerContact.whatsappUrl && (
																				<ContactLink
																					href={
																						buyerContact.whatsappUrl
																					}
																					target="_blank"
																					rel="noopener noreferrer"
																				>
																					WhatsApp
																				</ContactLink>
																			)}
																		</ContactLinks>
																		{(buyerContact
																			.instructions
																			?.length ??
																			0) >
																			0 && (
																			<Text
																				$muted
																				$size={
																					12
																				}
																			>
																				{buyerContact.instructions?.join(
																					" ",
																				)}
																			</Text>
																		)}
																	</ContactBox>
																)}

															{showCheckoutNote && (
																<BuyerNoteBox>
																	<Text
																		$size={
																			12
																		}
																		$weight={
																			800
																		}
																	>
																		{
																			checkoutNoteLabel
																		}
																	</Text>
																	<Text
																		$muted={
																			!checkoutNote
																		}
																		$size={
																			13
																		}
																	>
																		{checkoutNote ||
																			"No delivery instructions provided"}
																	</Text>
																</BuyerNoteBox>
															)}

															<Row
																$gap={10}
																$justify="flex-end"
																$align="center"
																$wrap
															>
																<Button
																	$size="sm"
																	$variant="secondary"
																	disabled={
																		!canMessageBuyer(
																			order,
																		)
																	}
																	title={
																		canMessageBuyer(
																			order,
																		)
																			? "Message buyer"
																			: ORDER_CHAT_NOT_OPEN_MESSAGE
																	}
																	onClick={() =>
																		setMessageOrderId(
																			messageOrderId ===
																				order.id
																				? null
																				: order.id,
																		)
																	}
																>
																	<FiMessageCircle
																		size={
																			14
																		}
																		aria-hidden
																	/>{" "}
																	Message
																	buyer
																</Button>
																{order.fulfillmentType ===
																	"DELIVERY" &&
																	!buyerContact &&
																	order.status !==
																		"AWAITING_VENDOR_ACCEPTANCE" && (
																		<Button
																			$size="sm"
																			$variant="secondary"
																			$loading={
																				contactBusyId ===
																				order.id
																			}
																			onClick={() =>
																				revealBuyerContact(
																					order,
																				)
																			}
																		>
																			<FiPhone
																				size={
																					14
																				}
																				aria-hidden
																			/>{" "}
																			Show
																			buyer
																			details
																		</Button>
																	)}
																{order.status ===
																	"AWAITING_VENDOR_ACCEPTANCE" &&
																!acceptanceOverdue ? (
																	<>
																		<Button
																			$size="sm"
																			$loading={
																				busyId ===
																				order.id
																			}
																			onClick={() =>
																				advance(
																					order,
																				)
																			}
																		>
																			<FiCheckCircle
																				size={
																					14
																				}
																				aria-hidden
																			/>{" "}
																			Accept
																			order
																		</Button>
																		<Button
																			$size="sm"
																			$variant="danger"
																			$loading={
																				busyId ===
																				order.id
																			}
																			onClick={() =>
																				openReasonAction(
																					"reject",
																					order,
																				)
																			}
																		>
																			<FiXCircle
																				size={
																					14
																				}
																				aria-hidden
																			/>{" "}
																			Reject
																			order
																		</Button>
																	</>
																) : handoverEligible ? (
																	<>
																		<Button
																			$size="sm"
																			$loading={
																				busyId ===
																				order.id
																			}
																			onClick={() =>
																				openHandover(
																					order,
																					"QR",
																				)
																			}
																		>
																			<FiCamera
																				size={
																					14
																				}
																				aria-hidden
																			/>{" "}
																			Scan
																			buyer
																			QR
																		</Button>
																		<Button
																			$size="sm"
																			$variant="secondary"
																			$loading={
																				busyId ===
																				order.id
																			}
																			onClick={() =>
																				openHandover(
																					order,
																					"PIN",
																				)
																			}
																		>
																			<FiHash
																				size={
																					14
																				}
																				aria-hidden
																			/>{" "}
																			Enter
																			buyer
																			PIN
																		</Button>
																	</>
																) : next &&
																	NextIcon ? (
																	<Button
																		$size="sm"
																		$loading={
																			busyId ===
																			order.id
																		}
																		onClick={() =>
																			advance(
																				order,
																			)
																		}
																	>
																		<NextIcon
																			size={
																				14
																			}
																			aria-hidden
																		/>{" "}
																		{
																			next.label
																		}
																	</Button>
																) : null}
															</Row>
															{messageOrderId ===
																order.id && (
																<OrderConversationPanel
																	orderId={
																		order.id
																	}
																	title="Message buyer"
																	autoFocus
																/>
															)}
														</Stack>
													</OrderCard>
												);
											})
										)}
									</Lane>
								);
							})}
						</Board>
					)}

					{completedOrders.length > 0 && (
						<HistoryPanel>
							<Stack $gap={14}>
								<Row
									$justify="space-between"
									$align="center"
									$gap={12}
								>
									<Stack $gap={2}>
										<Text $weight={800}>
											Completed orders
										</Text>
										<Text $muted $size={13}>
											Recent fulfilled orders are kept out
											of the live board.
										</Text>
									</Stack>
									<FilterRow>
										<FilterButton
											type="button"
											$active={
												completedFilter === "today"
											}
											onClick={() =>
												setCompletedFilter("today")
											}
										>
											Today
										</FilterButton>
										<FilterButton
											type="button"
											$active={completedFilter === "7d"}
											onClick={() =>
												setCompletedFilter("7d")
											}
										>
											Last 7 days
										</FilterButton>
										<FilterButton
											type="button"
											$active={completedFilter === "all"}
											onClick={() =>
												setCompletedFilter("all")
											}
										>
											All
										</FilterButton>
									</FilterRow>
								</Row>
								{filteredCompletedOrders.length === 0 ? (
									<LaneEmpty>
										No completed orders in this filter
									</LaneEmpty>
								) : (
									<HistoryList>
										{filteredCompletedOrders.map(
											(order) => (
												<OrderCard key={order.id}>
													<Stack $gap={8}>
														<Row
															$justify="space-between"
															$align="flex-start"
															$gap={10}
														>
															<OrderNumber
																$weight={700}
															>
																#
																{
																	order.orderNumber
																}
															</OrderNumber>
															<Text $weight={800}>
																{formatKobo(
																	order.totalKobo,
																)}
															</Text>
														</Row>
														<Badge $tone="success">
															<FiCheckCircle
																size={14}
																aria-hidden
															/>{" "}
															Completed
														</Badge>
														<Text $muted $size={13}>
															{order.items
																.map(
																	(item) =>
																		`${item.quantity}x ${item.snapshotName}`,
																)
																.join(", ")}
														</Text>
													</Stack>
												</OrderCard>
											),
										)}
									</HistoryList>
								)}
								{completedFilter !== "all" &&
									completedOrders.length > 6 && (
										<Row $justify="flex-end">
											<Button
												$size="sm"
												$variant="secondary"
												onClick={() =>
													setCompletedFilter("all")
												}
											>
												View all completed orders
											</Button>
										</Row>
									)}
							</Stack>
						</HistoryPanel>
					)}
				</Stack>
			</PipelineShell>
		</FadeIn>
	);
}
