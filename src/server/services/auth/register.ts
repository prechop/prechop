import {
	createUserDB,
	createVendorProfileDB,
	getUserByPhoneDB,
	UserRole,
} from "../../models";
import { recordAudit } from "../audit";
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
		const user = await createUserDB({
			payload: {
				firstName,
				lastName,
				phone,
				campusId,
				role: UserRole.BUYER,
			},
		});
		if (user) {
			recordAudit({
				userId: user._id.toString(),
				role: UserRole.BUYER,
				action: "BUYER_REGISTER",
				resourceType: "users",
				resourceId: user._id.toString(),
			});
		}
	}
	return requestOtp(phone);
}

/**
 * Register a vendor account (step 1): creates the VENDOR user + an INCOMPLETE
 * vendor profile, then sends the first OTP.
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
		const user = await createUserDB({
			payload: {
				firstName,
				lastName,
				phone,
				campusId,
				role: UserRole.VENDOR,
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
				role: UserRole.VENDOR,
				action: "VENDOR_REGISTER",
				resourceType: "users",
				resourceId: user._id.toString(),
			});
		}
	}
	return requestOtp(phone);
}
