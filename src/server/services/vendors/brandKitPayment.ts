import { ErrVendorNotFound } from "@/server/constants";
import { generatePaystackRef } from "@/server/constants/orderNumber";
import {
	BrandKitFulfillmentStatus,
	BrandKitPaymentStatus,
	getVendorProfileByUserIdDB,
	updateVendorProfileDB,
} from "@/server/models";
import { paystackProvider } from "@/server/providers";

export async function getBrandKitPaymentStatus({
	userId,
}: {
	userId: string;
}): Promise<{ status: BrandKitPaymentStatus; paidAt?: Date }> {
	const vendor = await getVendorProfileByUserIdDB({ userId });
	if (!vendor) throw ErrVendorNotFound;
	return {
		status: vendor.brandKitPaymentStatus ?? BrandKitPaymentStatus.PENDING,
		paidAt: vendor.brandKitPaidAt,
	};
}

export async function getBrandKitStatus({
	userId,
}: {
	userId: string;
}): Promise<{
	payment: { status: BrandKitPaymentStatus; paidAt?: Date };
	fulfillment: {
		status: BrandKitFulfillmentStatus;
		locationId?: string;
		receivedAt?: Date;
	};
}> {
	const vendor = await getVendorProfileByUserIdDB({ userId });
	if (!vendor) throw ErrVendorNotFound;
	return {
		payment: {
			status:
				vendor.brandKitPaymentStatus ?? BrandKitPaymentStatus.PENDING,
			paidAt: vendor.brandKitPaidAt,
		},
		fulfillment: {
			status:
				vendor.brandKitFulfillmentStatus ??
				BrandKitFulfillmentStatus.NOT_STARTED,
			locationId: vendor.brandKitFulfillmentLocationId,
			receivedAt: vendor.brandKitReceivedAt,
		},
	};
}

export async function confirmBrandKitReceipt({
	userId,
}: {
	userId: string;
}): Promise<{ status: BrandKitFulfillmentStatus; receivedAt: Date }> {
	const vendor = await getVendorProfileByUserIdDB({ userId });
	if (!vendor) throw ErrVendorNotFound;
	if (
		vendor.brandKitFulfillmentStatus !==
		BrandKitFulfillmentStatus.DELIVERED
	) {
		throw new Error(
			"Your Brand Kit must be marked as delivered before confirming receipt.",
		);
	}
	const receivedAt = new Date();
	await updateVendorProfileDB({
		id: vendor._id.toString(),
		payload: {
			brandKitFulfillmentStatus: BrandKitFulfillmentStatus.RECEIVED,
			brandKitReceivedAt: receivedAt,
		},
	});
	return {
		status: BrandKitFulfillmentStatus.RECEIVED,
		receivedAt,
	};
}

export async function updateBrandKitFulfillment({
	userId,
	status,
	locationId,
}: {
	userId: string;
	status: BrandKitFulfillmentStatus;
	locationId?: string;
}): Promise<{ status: BrandKitFulfillmentStatus; locationId?: string }> {
	const vendor = await getVendorProfileByUserIdDB({ userId });
	if (!vendor) throw ErrVendorNotFound;
	const payload: Record<string, unknown> = {
		brandKitFulfillmentStatus: status,
	};
	if (locationId !== undefined) {
		payload.brandKitFulfillmentLocationId = locationId;
	}
	await updateVendorProfileDB({
		id: vendor._id.toString(),
		payload,
	});
	return { status, locationId };
}

export async function initiateBrandKitPayment({
	userId,
	amountKobo,
}: {
	userId: string;
	amountKobo: number;
}): Promise<{ paymentUrl: string; reference: string } | null> {
	const vendor = await getVendorProfileByUserIdDB({ userId });
	if (!vendor) throw ErrVendorNotFound;
	if (vendor.brandKitPaymentStatus === BrandKitPaymentStatus.PAID) {
		return { paymentUrl: "", reference: "" };
	}

	const reference = generatePaystackRef();
	const email = vendor.email || `vendor-${userId}@prechop.ng`;

	try {
		const result = await paystackProvider.initializeTransaction({
			email,
			amountKobo,
			reference,
			settlementMode: undefined,
			subaccountCode: undefined,
			vendorAmountKobo: 0,
			metadata: {
				vendorId: vendor._id.toString(),
				userId,
				paymentType: "BRAND_KIT",
			},
		});

		await updateVendorProfileDB({
			id: vendor._id.toString(),
			payload: {
				brandKitPaymentStatus: BrandKitPaymentStatus.PENDING,
				brandKitPaymentId: reference,
			},
		});

		return {
			paymentUrl: result.authorization_url,
			reference,
		};
	} catch {
		await updateVendorProfileDB({
			id: vendor._id.toString(),
			payload: {
				brandKitPaymentStatus: BrandKitPaymentStatus.FAILED,
			},
		});
		return null;
	}
}
