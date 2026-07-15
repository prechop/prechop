import crypto from "node:crypto";
import { APP_URL, ErrPaymentVerification } from "../../constants";
import {
	getBuyerOrderByReceiptUrlDB,
	getPaymentByOrderIdDB,
	getVendorProfileByIdDB,
	OrderStatus,
	PaymentStatus,
	setBuyerOrderReceiptUrlDB,
} from "../../models";
import type { IBuyerOrder } from "../../models/buyerOrders/types";

export interface PublicReceipt {
	vendorName: string;
	orderNumber: string;
	amountPaidKobo: number;
	paymentStatus: "PAID";
	paymentDate: string;
	receiptLink: string;
}

function receiptUrlFromToken(token: string): string {
	return `${APP_URL.replace(/\/$/, "")}/receipt/${token}`;
}

function tokenFromReceiptUrl(receiptUrl: string): string | null {
	try {
		const url = new URL(receiptUrl);
		const [, route, token] = url.pathname.split("/");
		return route === "receipt" && token ? token : null;
	} catch {
		return null;
	}
}

function generateReceiptToken(): string {
	return crypto.randomBytes(32).toString("base64url");
}

export async function ensureReceiptUrl(order: IBuyerOrder): Promise<string> {
	if (order.receiptUrl) return order.receiptUrl;
	const receiptUrl = receiptUrlFromToken(generateReceiptToken());
	const saved = await setBuyerOrderReceiptUrlDB({
		id: order._id.toString(),
		receiptUrl,
	});
	return saved ? receiptUrl : "";
}

export async function getPublicReceipt(token: string): Promise<PublicReceipt> {
	const receiptLink = receiptUrlFromToken(token);
	const order = await getBuyerOrderByReceiptUrlDB({
		receiptUrl: receiptLink,
	});
	if (!order || order.status !== OrderStatus.PAID || !order.paidAt) {
		throw ErrPaymentVerification;
	}
	const payment = await getPaymentByOrderIdDB({
		buyerOrderId: order._id.toString(),
	});
	if (!payment?.webhookVerified || payment.status !== PaymentStatus.SUCCESS) {
		throw ErrPaymentVerification;
	}
	const vendor = await getVendorProfileByIdDB({
		id: order.vendorId.toString(),
	});
	if (!vendor) throw ErrPaymentVerification;

	return {
		vendorName: vendor.businessName ?? "Prechop vendor",
		orderNumber: order.orderNumber,
		amountPaidKobo: order.totalKobo,
		paymentStatus: "PAID",
		paymentDate: order.paidAt.toISOString(),
		receiptLink,
	};
}

export function getReceiptTokenFromOrder(order: IBuyerOrder): string | null {
	return order.receiptUrl ? tokenFromReceiptUrl(order.receiptUrl) : null;
}
