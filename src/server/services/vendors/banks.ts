import { paystackProvider } from "@/server/providers";

export async function listBanks() {
	return paystackProvider.getBanks();
}
