import { updateVendorProfileDB } from "@/server/models";
import { paystackProvider } from "@/server/providers";
import { recomputeVendorCompleteness } from "./recomputeVendorCompleteness";
import { resolveVendorByUserId, vendorIdOf } from "./resolveVendor";

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
	return updated;
}
