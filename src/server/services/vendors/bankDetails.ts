import { updateVendorProfileDB } from "@/server/models";
import { paystackProvider } from "@/server/providers";
import { notifyAdminAttention } from "@/server/services/notifications";
import { recomputeVendorCompleteness } from "./recomputeVendorCompleteness";
import { resolveVendorByUserId, vendorIdOf } from "./resolveVendor";
import { assertVendorSecurityVerifiedForSensitiveAction } from "./securityOnboarding";

export async function setBankDetails({
	userId,
	bankCode,
	accountNumber,
	bankName,
}: {
	userId: string;
	bankCode: string;
	accountNumber: string;
	bankName?: string;
}) {
	const vendor = await resolveVendorByUserId({ userId });
	const vendorId = vendorIdOf(vendor);
	assertVendorSecurityVerifiedForSensitiveAction(vendor);
	const hadExistingBank = !!vendor.paystackSubaccountCode;

	const resolved = await paystackProvider.resolveAccountNumber(
		accountNumber,
		bankCode,
	);
	const accountName = resolved.account_name;

	let resolvedBankName = bankName;
	if (!resolvedBankName) {
		const banks = await paystackProvider.getBanks();
		resolvedBankName = banks.find((b) => b.code === bankCode)?.name;
	}

	const businessName = vendor.businessName ?? accountName;
	const subaccount = await paystackProvider.createSubaccount({
		businessName,
		bankCode,
		accountNumber,
	});

	const updated = await updateVendorProfileDB({
		id: vendorId,
		payload: {
			bankCode,
			bankName: resolvedBankName,
			accountNumber,
			accountName,
			paystackSubaccountCode: subaccount.subaccount_code,
		},
	});

	await recomputeVendorCompleteness({ vendorId, userId });
	if (hadExistingBank) {
		await notifyAdminAttention({
			kind: "VENDOR_BANK_CHANGE",
			title: "Vendor bank account changed",
			whatHappened: `${vendor.businessName ?? "A vendor"} changed payout bank details.`,
			submittedBy: `${vendor.businessName ?? "Vendor"} (user ${userId})`,
			recordId: vendorId,
			adminPath: `/admin/vendors?vendorId=${encodeURIComponent(vendorId)}`,
			dedupeKey: `vendor-bank:${vendorId}:${new Date().toISOString().slice(0, 10)}`,
		});
	}
	return updated;
}
