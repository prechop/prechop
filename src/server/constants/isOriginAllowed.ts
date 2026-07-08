import clientAppURLs from "./clientAppURLs";
import { NODE_ENV } from "./environments";

const whitelist = clientAppURLs.map((item) => item.url);

export default function isOriginAllowed(origin: string | undefined): boolean {
	if (!origin) return false;

	// Allow local network IPs in development only (for mobile testing).
	if (NODE_ENV !== "production") {
		const rawHost = origin.replace(/^https?:\/\//, "").replace(/:\d+$/, "");
		if (/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(rawHost)) {
			return true;
		}
	}

	// Strip protocol/www, port, and subdomains down to the root eTLD+1.
	const originWithoutPort = origin
		.replace(/:\d+$/, "")
		.replace(/^https?:\/\/(www\.)?/, "")
		.split(".")
		.slice(-2)
		.join(".");

	return whitelist.some((allowed) => originWithoutPort === allowed);
}
