import { BUYERS_GROUP, VENDORS_GROUP } from "../../constants";
import {
	createUserDB,
	createVendorProfileDB,
	getUserByPhoneDB,
} from "../../models";
import { recordAudit } from "../audit";
import { getBuiltInGroupId } from "../iam";
import { requestOtp } from "./requestOtp";

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
	const existing = await getUserByPhoneDB({ phone });
	if (!existing) {
		const buyersGroupId = await getBuiltInGroupId(BUYERS_GROUP);
		const user = await createUserDB({
			payload: {
				firstName,
				lastName,
				phone,
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
	return requestOtp(phone);
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
	campusId: string;
	email: string;
	businessName?: string;
}): Promise<{ message: string }> {
	const existing = await getUserByPhoneDB({ phone });
	if (!existing) {
		const vendorsGroupId = await getBuiltInGroupId(VENDORS_GROUP);
		const user = await createUserDB({
			payload: {
				firstName,
				lastName,
				phone,
				campusId,
				groupIds: vendorsGroupId ? [vendorsGroupId] : [],
			},
		});
		if (user) {
			await createVendorProfileDB({
				payload: {
					userId: user._id.toString(),
					campusId,
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
	return requestOtp(phone);
}
