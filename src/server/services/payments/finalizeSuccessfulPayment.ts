import crypto from "node:crypto";
import {
	ErrPaymentAmountMismatch,
	ErrPaymentVerification,
	koboToNaira,
	tryDecrypt,
} from "../../constants";
import { acquireLock, releaseLock } from "../../databases";
import type { IBuyerOrder } from "../../models";
import {
	claimPaymentWebhookDB,
	decrementDailyOrderItemQuantityDB,
	getBuyerOrderByIdDB,
	getDailyOrderByIdDB,
	getPaymentByRefDB,
	getUserByIdWithPhoneDB,
	getVendorProfileByIdDB,
	incrementDailyOrderItemQuantityDB,
	incrementDailyOrderTotalCountDB,
	incrementVendorOrderCountDB,
	markBuyerOrderCancelledDB,
	markBuyerOrderInventoryCommittedDB,
	markBuyerOrderPaidDB,
	OrderStatus,
} from "../../models";
import { sendchampProvider } from "../../providers";
import {
	commitSlots,
	getReservedSlotQuantity,
	getReservedSlotQuantityForReservation,
} from "../buyerOrders/slots";
import {
	createUserNotification,
	sendVendorNewPaidOrderEmail,
} from "../notifications";
import { issueRefund } from "../refunds";
import { getSiteConfigs } from "../siteConfigs";

type CapacityCommitStatus =
	| "CAPACITY_COMMITTED"
	| "CAPACITY_ALREADY_COMMITTED"
	| "CAPACITY_RECOVERED"
	| "CAPACITY_EXHAUSTED"
	| "RESERVATION_OWNERSHIP_MISMATCH";

interface CapacityCommitResult {
	status: CapacityCommitStatus;
}

export async function finalizeSuccessfulPayment({
	reference,
	amountKobo,
	channel,
}: {
	reference: string;
	amountKobo: number;
	channel?: string;
}): Promise<{
	received: boolean;
	status:
		| "PAYMENT_CONFIRMED"
		| "PAYMENT_ALREADY_CONFIRMED"
		| "ORDER_STATE_CONFLICT";
	orderNumber?: string;
	buyerOrderId?: string;
	alreadyProcessed?: boolean;
}> {
	const payment = await getPaymentByRefDB({ paystackRef: reference });
	if (!payment) throw ErrPaymentVerification;
	if (amountKobo !== payment.amountKobo) throw ErrPaymentAmountMismatch;

	const order = await getBuyerOrderByIdDB({ id: payment.buyerOrderId });
	if (!order) throw ErrPaymentVerification;

	const lockKey = `payment:finalize:${payment.buyerOrderId.toString()}`;
	const lockValue = crypto.randomUUID();
	const lockAcquired = await acquireLock(lockKey, lockValue, 30);
	if (!lockAcquired) {
		return finalizationInProgressResult(payment.buyerOrderId.toString());
	}

	try {
		if (payment.webhookVerified) {
			if (isTerminalConflictOrder(order)) {
				return {
					received: true,
					status: "ORDER_STATE_CONFLICT",
					buyerOrderId: order._id.toString(),
					alreadyProcessed: true,
				};
			}
			if (isPaidOrder(order) && order.inventoryCommittedAt) {
				logInventoryCommit({
					...baseInventoryDiagnostics(order),
					stage: "already_finalized",
					commitState: "already_committed",
					rejectionReason: order.inventoryCommittedAt
						? undefined
						: "LEGACY_CONFIRMED_WITHOUT_COMMIT_MARKER",
				});
				return {
					received: true,
					status: "PAYMENT_ALREADY_CONFIRMED",
					buyerOrderId: order._id.toString(),
					alreadyProcessed: true,
				};
			}
		} else {
			const claimed = await claimPaymentWebhookDB({
				paystackRef: reference,
				channel,
			});
			if (!claimed) {
				return {
					received: true,
					status: "PAYMENT_ALREADY_CONFIRMED",
					buyerOrderId: payment.buyerOrderId.toString(),
					alreadyProcessed: true,
				};
			}
		}

		if (isTerminalConflictOrder(order)) {
			return {
				received: true,
				status: "ORDER_STATE_CONFLICT",
				buyerOrderId: order._id.toString(),
				alreadyProcessed: true,
			};
		}
		if (isPaidOrder(order) && order.inventoryCommittedAt) {
			logInventoryCommit({
				...baseInventoryDiagnostics(order),
				stage: "already_finalized",
				commitState: "already_committed",
				rejectionReason: order.inventoryCommittedAt
					? undefined
					: "PAID_ORDER_WITHOUT_COMMIT_MARKER",
			});
			return {
				received: true,
				status: "PAYMENT_ALREADY_CONFIRMED",
				buyerOrderId: order._id.toString(),
				alreadyProcessed: true,
			};
		}

		if (await pendingReservationExpired(payment.createdAt)) {
			const cancelled = await markBuyerOrderCancelledDB({
				id: order._id.toString(),
				reason: "Checkout reservation expired before payment settled.",
				reasonCode: "RESERVATION_EXPIRED",
				cancelledBy: "system",
				fromStatuses: [
					OrderStatus.PENDING_PAYMENT,
					OrderStatus.AWAITING_EXTERNAL_PAYMENT,
				],
			});
			if (cancelled) {
				await commitSlots(slotHolds(order), order._id.toString());
				console.warn(
					`[payment] RESERVATION_EXPIRED after payment - refunding: order=${order._id.toString()} ref=${maskReference(reference)} amountKobo=${payment.amountKobo}`,
				);
				try {
					await issueRefund({
						orderId: order._id.toString(),
						amountKobo: payment.amountKobo,
						reason: "Payment settled after the checkout reservation expired.",
						paystackRef: reference,
					});
				} catch (error) {
					console.error(
						`[payment] refund after expired reservation failed - refund row left for reconciliation: order=${order._id.toString()} ref=${maskReference(reference)} amountKobo=${payment.amountKobo}:`,
						error,
					);
				}
				return {
					received: true,
					status: "ORDER_STATE_CONFLICT",
					buyerOrderId: order._id.toString(),
				};
			}
		}

		const paid = isPaidOrder(order)
			? order
			: await markBuyerOrderPaidDB({
					id: order._id.toString(),
					channel,
				});
		if (!paid) {
			const latest = await getBuyerOrderByIdDB({
				id: order._id.toString(),
			});
			if (
				latest &&
				!isTerminalConflictOrder(latest) &&
				isPaidOrder(latest)
			) {
				return {
					received: true,
					status: "PAYMENT_ALREADY_CONFIRMED",
					buyerOrderId: latest._id.toString(),
					alreadyProcessed: true,
				};
			}
			console.warn(
				`[payment] LATE SETTLEMENT on non-payable order - refunding in full: order=${order._id.toString()} ref=${maskReference(reference)} amountKobo=${payment.amountKobo}`,
			);
			try {
				await issueRefund({
					orderId: order._id.toString(),
					amountKobo: payment.amountKobo,
					reason: "Payment settled after the order was already cancelled.",
					paystackRef: reference,
				});
			} catch (error) {
				console.error(
					`[payment] refund of late settlement failed - refund row left for reconciliation: order=${order._id.toString()} ref=${maskReference(reference)} amountKobo=${payment.amountKobo}:`,
					error,
				);
			}
			return {
				received: true,
				status: "ORDER_STATE_CONFLICT",
				buyerOrderId: order._id.toString(),
			};
		}

		const capacity = paid.inventoryCommittedAt
			? ({ status: "CAPACITY_ALREADY_COMMITTED" } as const)
			: await commitOrderCapacity(paid);
		if (capacity.status === "CAPACITY_ALREADY_COMMITTED") {
			return {
				received: true,
				status: "PAYMENT_ALREADY_CONFIRMED",
				orderNumber: paid.orderNumber,
				buyerOrderId: paid._id.toString(),
				alreadyProcessed: true,
			};
		}
		if (capacity.status === "CAPACITY_EXHAUSTED") {
			await commitSlots(slotHolds(paid), paid._id.toString());
			const latest = await getBuyerOrderByIdDB({
				id: paid._id.toString(),
			});
			if (latest?.inventoryCommittedAt && isPaidOrder(latest)) {
				return {
					received: true,
					status: "PAYMENT_ALREADY_CONFIRMED",
					orderNumber: latest.orderNumber,
					buyerOrderId: latest._id.toString(),
					alreadyProcessed: true,
				};
			}
			console.warn(
				`[payment] INSUFFICIENT_QUANTITY after payment - refunding: order=${paid._id.toString()} ref=${maskReference(reference)} amountKobo=${payment.amountKobo}`,
			);
			try {
				await issueRefund({
					orderId: paid._id.toString(),
					amountKobo: payment.amountKobo,
					reason: "Payment settled after listing capacity was exhausted.",
					paystackRef: reference,
				});
			} catch (error) {
				console.error(
					`[payment] refund after capacity failure failed - refund row left for reconciliation: order=${paid._id.toString()} ref=${maskReference(reference)} amountKobo=${payment.amountKobo}:`,
					error,
				);
			}
			return {
				received: true,
				status: "ORDER_STATE_CONFLICT",
				buyerOrderId: paid._id.toString(),
			};
		}
		if (!paid.inventoryCommittedAt) {
			const committedOrder = await markBuyerOrderInventoryCommittedDB({
				id: paid._id.toString(),
			});
			if (!committedOrder) {
				const latest = await getBuyerOrderByIdDB({
					id: paid._id.toString(),
				});
				if (latest?.inventoryCommittedAt) {
					return {
						received: true,
						status: "PAYMENT_ALREADY_CONFIRMED",
						orderNumber: latest.orderNumber,
						buyerOrderId: latest._id.toString(),
						alreadyProcessed: true,
					};
				}
			}
		}
		await incrementDailyOrderTotalCountDB({
			dailyOrderId: paid.dailyOrderId.toString(),
		});
		await incrementVendorOrderCountDB({ id: paid.vendorId.toString() });
		await commitSlots(slotHolds(paid), paid._id.toString());

		await notifyParties(paid);

		return {
			received: true,
			status: "PAYMENT_CONFIRMED",
			orderNumber: paid.orderNumber,
			buyerOrderId: paid._id.toString(),
		};
	} finally {
		await releaseLock(lockKey, lockValue);
	}
}

async function commitOrderCapacity(
	order: IBuyerOrder,
): Promise<CapacityCommitResult> {
	if (order.inventoryCommittedAt) {
		return { status: "CAPACITY_ALREADY_COMMITTED" };
	}
	const dailyOrderId = order.dailyOrderId.toString();
	const committed: Array<{ dailyOrderItemId: string; quantity: number }> = [];
	let recoveredFromMissingHold = false;
	for (const item of order.items) {
		const dailyOrderItemId = item.dailyOrderItemId.toString();
		const diagnostics = await inventoryCommitDiagnostics({
			order,
			dailyOrderItemId,
			requestedQuantity: item.quantity,
		});
		const ownershipMismatch =
			diagnostics.totalReservedQuantity > 0 &&
			diagnostics.thisOrderReservedQuantity < item.quantity;
		logInventoryCommit({
			...diagnostics,
			stage: "before_increment",
			commitState: "attempting",
			rejectionReason: ownershipMismatch
				? "RESERVATION_OWNERSHIP_MISMATCH"
				: diagnostics.rejectionReason,
		});
		if (diagnostics.rejectionReason === "ITEM_NOT_FOUND") {
			logInventoryCommit({
				...diagnostics,
				stage: "before_increment",
				commitState: "rejected",
				rejectionReason: diagnostics.rejectionReason,
			});
			return { status: "CAPACITY_EXHAUSTED" };
		}
		const ok = await incrementDailyOrderItemQuantityDB({
			dailyOrderId,
			dailyOrderItemId,
			by: item.quantity,
		});
		if (!ok) {
			const failedDiagnostics = await inventoryCommitDiagnostics({
				order,
				dailyOrderItemId,
				requestedQuantity: item.quantity,
			});
			logInventoryCommit({
				...failedDiagnostics,
				stage: "after_increment",
				commitState: "rejected",
				rejectionReason: "ATOMIC_INCREMENT_REJECTED",
			});
			await Promise.allSettled(
				committed.map((it) =>
					decrementDailyOrderItemQuantityDB({
						dailyOrderId,
						dailyOrderItemId: it.dailyOrderItemId,
						by: it.quantity,
					}),
				),
			);
			return { status: "CAPACITY_EXHAUSTED" };
		}
		if (ownershipMismatch) recoveredFromMissingHold = true;
		logInventoryCommit({
			...diagnostics,
			stage: "after_increment",
			commitState: "committed",
			rejectionReason: ownershipMismatch
				? "RESERVATION_OWNERSHIP_MISMATCH"
				: undefined,
		});
		committed.push({ dailyOrderItemId, quantity: item.quantity });
	}
	return {
		status: recoveredFromMissingHold
			? "CAPACITY_RECOVERED"
			: "CAPACITY_COMMITTED",
	};
}

async function finalizationInProgressResult(orderId: string): Promise<{
	received: boolean;
	status:
		| "PAYMENT_CONFIRMED"
		| "PAYMENT_ALREADY_CONFIRMED"
		| "ORDER_STATE_CONFLICT";
	orderNumber?: string;
	buyerOrderId?: string;
	alreadyProcessed?: boolean;
}> {
	const latest = await getBuyerOrderByIdDB({ id: orderId });
	if (latest && isTerminalConflictOrder(latest)) {
		return {
			received: true,
			status: "ORDER_STATE_CONFLICT",
			buyerOrderId: latest._id.toString(),
			alreadyProcessed: true,
		};
	}
	return {
		received: true,
		status: "PAYMENT_ALREADY_CONFIRMED",
		orderNumber: latest?.orderNumber,
		buyerOrderId: latest?._id.toString() ?? orderId,
		alreadyProcessed: true,
	};
}

function isTerminalConflictOrder(order: IBuyerOrder): boolean {
	return [OrderStatus.CANCELLED, OrderStatus.REFUNDED].includes(order.status);
}

function isPaidOrder(order: IBuyerOrder): boolean {
	return ![
		OrderStatus.PENDING_PAYMENT,
		OrderStatus.AWAITING_EXTERNAL_PAYMENT,
	].includes(order.status);
}

function baseInventoryDiagnostics(order: IBuyerOrder) {
	return {
		listingId: order.dailyOrderId.toString(),
		orderId: order._id.toString(),
		reservationId: order._id.toString(),
		dailyOrderItemId: "",
		requestedQuantity: 0,
		maxQuantity: null,
		orderedQuantity: 0,
		totalReservedQuantity: 0,
		thisOrderReservedQuantity: 0,
		computedAvailableQuantity: null,
	};
}

async function inventoryCommitDiagnostics({
	order,
	dailyOrderItemId,
	requestedQuantity,
}: {
	order: IBuyerOrder;
	dailyOrderItemId: string;
	requestedQuantity: number;
}) {
	const listing = await getDailyOrderByIdDB({
		id: order.dailyOrderId.toString(),
	});
	const listingItem = listing?.items.find(
		(item) => (item.id ?? item._id)?.toString() === dailyOrderItemId,
	);
	const maxQuantity = listingItem?.maxQuantity ?? null;
	const orderedQuantity = listingItem?.orderedQuantity ?? 0;
	const totalReservedQuantity =
		await getReservedSlotQuantity(dailyOrderItemId);
	const thisOrderReservedQuantity =
		await getReservedSlotQuantityForReservation(
			dailyOrderItemId,
			order._id.toString(),
		);
	const otherReservedQuantity = Math.max(
		0,
		totalReservedQuantity - thisOrderReservedQuantity,
	);
	const computedAvailableQuantity =
		maxQuantity === null || maxQuantity === undefined
			? null
			: Math.max(
					0,
					maxQuantity - orderedQuantity - otherReservedQuantity,
				);
	return {
		listingId: order.dailyOrderId.toString(),
		orderId: order._id.toString(),
		reservationId: order._id.toString(),
		dailyOrderItemId,
		requestedQuantity,
		maxQuantity,
		orderedQuantity,
		totalReservedQuantity,
		thisOrderReservedQuantity,
		computedAvailableQuantity,
		rejectionReason: listingItem ? undefined : "ITEM_NOT_FOUND",
	};
}

function logInventoryCommit(input: {
	listingId: string;
	orderId: string;
	reservationId: string;
	dailyOrderItemId: string;
	requestedQuantity: number;
	maxQuantity: number | null | undefined;
	orderedQuantity: number;
	totalReservedQuantity: number;
	thisOrderReservedQuantity: number;
	computedAvailableQuantity: number | null;
	stage: "before_increment" | "after_increment" | "already_finalized";
	commitState: "attempting" | "committed" | "rejected" | "already_committed";
	rejectionReason?: string;
}) {
	console.info("[inventory-commit]", JSON.stringify(input));
}

async function pendingReservationExpired(createdAt: Date): Promise<boolean> {
	const config = await getSiteConfigs();
	if (config.slotHoldTtlSeconds <= 0) return false;
	return createdAt.getTime() + config.slotHoldTtlSeconds * 1000 <= Date.now();
}

function slotHolds(order: IBuyerOrder) {
	return order.items.map((i) => ({
		dailyOrderItemId: i.dailyOrderItemId.toString(),
		quantity: i.quantity,
	}));
}

function maskReference(reference: string): string {
	if (reference.length <= 8) return "****";
	return `${reference.slice(0, 4)}...${reference.slice(-4)}`;
}

async function notifyParties(order: IBuyerOrder): Promise<void> {
	let vendorName = "";
	try {
		const vendor = await getVendorProfileByIdDB({
			id: order.vendorId.toString(),
		});
		vendorName = vendor?.businessName ?? "";
		if (vendor?.userId) {
			const notification = await createUserNotification({
				userId: vendor.userId.toString(),
				title: "New paid order",
				body: `Order ${order.orderNumber} - ₦${koboToNaira(order.totalKobo).toLocaleString()}`,
				type: "ORDER_PAID",
				dedupeKey: `order:${order.orderNumber}:vendor:paid`,
				data: { orderNumber: order.orderNumber },
			});
			if (notification.created) {
				void sendVendorNewPaidOrderEmail({
					notification: notification.notification,
					vendor,
					order,
				}).catch((error) =>
					console.error(
						`[payment] vendor new-order email failed order=${order.orderNumber}:`,
						error,
					),
				);
			}
			const vendorUser = await getUserByIdWithPhoneDB({
				id: vendor.userId.toString(),
			});
			const phone =
				notification.created && vendorUser?.phone
					? tryDecrypt(vendorUser.phone)
					: "";
			if (phone) {
				sendchampProvider
					.sendVendorNewOrder(
						phone,
						order.orderNumber,
						koboToNaira(order.totalKobo),
					)
					.catch(() => {});
			}
		}
	} catch (error) {
		console.error(
			`[payment] notify vendor failed order=${order.orderNumber} vendorProfileId=${order.vendorId.toString()}:`,
			error,
		);
	}

	try {
		await createUserNotification({
			userId: order.buyerId.toString(),
			title: "Payment received",
			body: vendorName
				? `Payment for order ${order.orderNumber} is confirmed. ${vendorName} has 10 minutes to accept it.`
				: `Payment for order ${order.orderNumber} is confirmed. Your vendor has 10 minutes to accept it.`,
			type: "ORDER_PAID_AWAITING_VENDOR",
			dedupeKey: `order:${order.orderNumber}:buyer:paid-awaiting-vendor`,
			data: { orderNumber: order.orderNumber },
		});
	} catch (error) {
		console.error(
			`[payment] notify buyer failed order=${order.orderNumber} buyerId=${order.buyerId.toString()}:`,
			error,
		);
	}
}
