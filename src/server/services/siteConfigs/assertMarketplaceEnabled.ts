import { serviceUnavailable } from "../../constants";
import { getSiteConfigs } from "./getSiteConfigs";

export const MARKETPLACE_UNAVAILABLE_MESSAGE =
	"The marketplace is temporarily unavailable.";

export async function assertMarketplaceEnabled(): Promise<void> {
	const config = await getSiteConfigs();
	if (!config.marketplaceEnabled) {
		throw serviceUnavailable(
			MARKETPLACE_UNAVAILABLE_MESSAGE,
			"MARKETPLACE_UNAVAILABLE",
		);
	}
}
