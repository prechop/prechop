import {
	AppError,
	BUYERS_GROUP,
	NIGERIAN_PHONE_ERROR_MESSAGE,
	normalizeNigerianMobilePhone,
	VENDORS_GROUP,
	validationError,
} from "../../constants";
import {
	createUserDB,
	createVendorProfileDB,
	getUserByPhoneDB,
	getVendorProfileByUserIdDB,
	listCampusesDB,
} from "../../models";
import type { IUser } from "../../models/users/types";
import { recordAudit } from "../audit";
import { getBuiltInGroupId } from "../iam";
import { requestOtp } from "./requestOtp";

/**
 * Create a lightweight Buyer account for a phone that just verified an OTP but
 * has never registered. This backs the single unified login: anyone who can
 * receive a code becomes a buyer on first sign-in and can set their name and
 * campus afterwards from /account. Vendors still apply explicitly via /sell.
 */
export async function autoProvisionBuyer(phone: string): Promise<IUser | null> {
	const normalizedPhone = requireNigerianMobilePhone(phone);
	const [buyersGroupId, campuses] = await Promise.all([
		getBuiltInGroupId(BUYERS_GROUP),
		listCampusesDB({ activeOnly: true }),
	]);
	const campus = campuses[0];
	if (!campus) {
		throw validationError(
			"No campus is configured yet. Please try again later.",
		);
	}
	const user = await createUserDB({
		payload: {
			firstName: "Guest",
			lastName: "Buyer",
			phone: normalizedPhone,
			campusId: campus._id.toString(),
			groupIds: buyersGroupId ? [buyersGroupId] : [],
			isPhoneVerified: true,
		},
	});
	if (user) {
		recordAudit({
			userId: user._id.toString(),
			role: BUYERS_GROUP,
			action: "BUYER_REGISTER",
			resourceType: "users",
			resourceId: user._id.toString(),
		});
	}
	return user;
}

/**
 * Register a buyer, then send the first OTP. If the phone already exists this
 * acts as a login request — we never reveal account existence in the response.
 */
export async function registerBuyer({
	firstName,
	lastName,
	phone,
	campusId,
}: {
	firstName: string;
	lastName: string;
	phone: string;
	campusId: string;
}): Promise<{ message: string }> {
	const normalizedPhone = requireNigerianMobilePhone(phone);
	const existing = await getUserByPhoneDB({ phone: normalizedPhone });
	if (!existing) {
		const buyersGroupId = await getBuiltInGroupId(BUYERS_GROUP);
		const user = await createUserDB({
			payload: {
				firstName,
				lastName,
				phone: normalizedPhone,
				campusId,
				groupIds: buyersGroupId ? [buyersGroupId] : [],
			},
		});
		if (user) {
			recordAudit({
				userId: user._id.toString(),
				role: BUYERS_GROUP,
				action: "BUYER_REGISTER",
				resourceType: "users",
				resourceId: user._id.toString(),
			});
		}
	}
	return requestOtp(normalizedPhone);
}

/**
 * Register a vendor account (step 1): creates the user in the Vendors group +
 * an INCOMPLETE vendor profile, then sends the first OTP.
 */
export async function registerVendor({
	firstName,
	lastName,
	phone,
	campusId,
	email,
	businessName,
}: {
	firstName: string;
	lastName: string;
	phone: string;
	campusId?: string;
	email: string;
	businessName?: string;
}): Promise<{ message: string }> {
	const normalizedPhone = requireNigerianMobilePhone(phone);
	const existing = await getUserByPhoneDB({ phone: normalizedPhone });
	const buyersGroupId = await getBuiltInGroupId(BUYERS_GROUP);
	const existingVendor = existing
		? await getVendorProfileByUserIdDB({ userId: existing._id.toString() })
		: null;
	if (
		existing &&
		buyersGroupId &&
		!existingVendor &&
		existing.groupIds.map((g) => g.toString()).includes(buyersGroupId)
	) {
		throw new AppError(
			"This phone number is already registered as a buyer. Log in and apply to become a vendor from your account settings.",
			409,
			"BUYER_ACCOUNT_EXISTS",
		);
	}
	if (!existing) {
		const [vendorsGroupId, campuses] = await Promise.all([
			getBuiltInGroupId(VENDORS_GROUP),
			campusId
				? Promise.resolve([])
				: listCampusesDB({ activeOnly: true }),
		]);
		const selectedCampusId = campusId || campuses[0]?._id.toString();
		if (!selectedCampusId) {
			throw validationError(
				"No campus is configured yet. Please try again later.",
			);
		}
		const user = await createUserDB({
			payload: {
				firstName,
				lastName,
				phone: normalizedPhone,
				campusId: selectedCampusId,
				groupIds: vendorsGroupId ? [vendorsGroupId] : [],
			},
		});
		if (user) {
			await createVendorProfileDB({
				payload: {
					userId: user._id.toString(),
					campusId: selectedCampusId,
					email,
					businessName,
				},
			});
			recordAudit({
				userId: user._id.toString(),
				role: VENDORS_GROUP,
				action: "VENDOR_REGISTER",
				resourceType: "users",
				resourceId: user._id.toString(),
			});
		}
	}
	return requestOtp(normalizedPhone);
}

function requireNigerianMobilePhone(phone: string): string {
	const normalizedPhone = normalizeNigerianMobilePhone(phone);
	if (!normalizedPhone) throw validationError(NIGERIAN_PHONE_ERROR_MESSAGE);
	return normalizedPhone;
}
