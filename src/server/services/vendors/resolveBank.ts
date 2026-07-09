import { paystackProvider } from "@/server/providers";

/**
 * Resolve-only bank lookup. Returns the account holder's name (and the bank
 * name) from Paystack so the vendor can confirm it before committing — this
 * neither creates a subaccount nor writes anything to the profile. The commit
 * happens later via `setBankDetails`.
 */
export async function resolveBankAccount({
	bankCode,
	accountNumber,
}: {
	bankCode: string;
	accountNumber: string;
}): Promise<{ accountName: string; bankName?: string; bankCode: string }> {
	const resolved = await paystackProvider.resolveAccountNumber(
		accountNumber,
		bankCode,
	);
	const banks = await paystackProvider.getBanks();
	const bankName = banks.find((b) => b.code === bankCode)?.name;
	return { accountName: resolved.account_name, bankName, bankCode };
}
