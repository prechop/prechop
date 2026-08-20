import {
	AppError,
	ErrInvalidFields,
	ErrVendorNotFound,
} from "@/server/constants";
import {
	BakeryBusinessType,
	updateVendorProfileDB,
	VendorType,
	VendorVerificationDocumentType,
} from "@/server/models";
import { s3Provider } from "@/server/providers";
import { resolveVendorByUserId, vendorIdOf } from "./resolveVendor";

export const VENDOR_VERIFICATION_LABELS: Record<
	VendorVerificationDocumentType,
	string
> = {
	[VendorVerificationDocumentType.SCHOOL_ID]: "School ID",
	[VendorVerificationDocumentType.STALL_EVIDENCE]: "Campus/stall evidence",
	[VendorVerificationDocumentType.OPERATOR_ID]: "Operator identity document",
	[VendorVerificationDocumentType.CAC]: "CAC details",
	[VendorVerificationDocumentType.REPRESENTATIVE_ID]:
		"Authorised representative ID",
	[VendorVerificationDocumentType.OWNER_ID]: "Owner identity document",
};

const ErrUnsupportedVerificationDocument = new AppError(
	"This document is not required for the selected vendor type.",
	400,
	"UNSUPPORTED_VERIFICATION_DOCUMENT",
);

export function requiredVerificationDocuments({
	vendorType,
	bakeryBusinessType,
}: {
	vendorType?: VendorType;
	bakeryBusinessType?: BakeryBusinessType;
}): VendorVerificationDocumentType[] {
	switch (vendorType) {
		case VendorType.STUDENT_COOK:
			return [VendorVerificationDocumentType.SCHOOL_ID];
		case VendorType.CAMPUS_STALL:
			return [
				VendorVerificationDocumentType.STALL_EVIDENCE,
				VendorVerificationDocumentType.OPERATOR_ID,
			];
		case VendorType.RESTAURANT:
			return [
				VendorVerificationDocumentType.CAC,
				VendorVerificationDocumentType.REPRESENTATIVE_ID,
			];
		case VendorType.BAKERY:
			if (bakeryBusinessType === BakeryBusinessType.HOME_BASED) {
				return [VendorVerificationDocumentType.OWNER_ID];
			}
			if (bakeryBusinessType === BakeryBusinessType.CAMPUS_BASED) {
				return [VendorVerificationDocumentType.SCHOOL_ID];
			}
			if (bakeryBusinessType === BakeryBusinessType.REGISTERED) {
				return [
					VendorVerificationDocumentType.CAC,
					VendorVerificationDocumentType.REPRESENTATIVE_ID,
				];
			}
			return [];
		default:
			return [];
	}
}

export function hasRequiredVerificationDocuments(vendor: {
	vendorType?: VendorType;
	bakeryBusinessType?: BakeryBusinessType;
	verificationDocuments?: { type: VendorVerificationDocumentType }[];
}) {
	const required = requiredVerificationDocuments({
		vendorType: vendor.vendorType,
		bakeryBusinessType: vendor.bakeryBusinessType,
	});
	if (required.length === 0) return false;
	const uploaded = new Set(
		(vendor.verificationDocuments ?? []).map((doc) => doc.type),
	);
	return required.every((type) => uploaded.has(type));
}

export async function presignVendorVerificationDocument({
	userId,
	mimeType,
}: {
	userId: string;
	mimeType: string;
}) {
	await resolveVendorByUserId({ userId });
	const { uploadUrl, key } = await s3Provider.getPresignedUploadUrl(
		"vendor-verifications",
		mimeType,
	);
	return { uploadUrl, key };
}

export async function confirmVendorVerificationDocument({
	userId,
	type,
	key,
	fileName,
	mimeType,
	bakeryBusinessType,
}: {
	userId: string;
	type: VendorVerificationDocumentType;
	key: string;
	fileName?: string;
	mimeType?: string;
	bakeryBusinessType?: BakeryBusinessType;
}) {
	const vendor = await resolveVendorByUserId({ userId });
	const vendorId = vendorIdOf(vendor);
	if (!vendor.vendorType) throw ErrInvalidFields;

	const nextBakeryBusinessType =
		vendor.vendorType === VendorType.BAKERY
			? (bakeryBusinessType ?? vendor.bakeryBusinessType)
			: undefined;
	const allowed = requiredVerificationDocuments({
		vendorType: vendor.vendorType,
		bakeryBusinessType: nextBakeryBusinessType,
	});
	if (!allowed.includes(type)) throw ErrUnsupportedVerificationDocument;

	const exists = await s3Provider.objectExists(key);
	if (!exists) throw ErrInvalidFields;

	const docs = (vendor.verificationDocuments ?? []).filter(
		(doc) => doc.type !== type,
	);
	docs.push({
		type,
		key,
		fileName,
		mimeType,
		uploadedAt: new Date(),
	});

	const updated = await updateVendorProfileDB({
		id: vendorId,
		payload: {
			verificationDocuments: docs,
			...(vendor.vendorType === VendorType.BAKERY
				? { bakeryBusinessType: nextBakeryBusinessType }
				: {}),
		},
	});
	if (!updated) throw ErrVendorNotFound;
	return updated;
}

export async function withVerificationDocumentReviewUrls<
	T extends {
		verificationDocuments?: {
			type: VendorVerificationDocumentType;
			key: string;
			fileName?: string;
			mimeType?: string;
			uploadedAt: Date;
		}[];
	},
>(vendor: T) {
	return {
		...vendor,
		verificationDocuments: await Promise.all(
			(vendor.verificationDocuments ?? []).map(async (doc) => ({
				...doc,
				label: VENDOR_VERIFICATION_LABELS[doc.type],
				reviewUrl: await s3Provider.getPresignedReadUrl(doc.key, 900),
			})),
		),
	};
}
