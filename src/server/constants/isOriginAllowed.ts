import clientAppURLs from "./clientAppURLs";
import { NODE_ENV } from "./environments";

const whitelist = clientAppURLs.map(({ url }) =>
	url
		.replace(/^https?:\/\//, "")
		.replace(/^www\./, "")
		.replace(/:\d+$/, "")
		.toLowerCase(),
);

export default function isOriginAllowed(origin: string | undefined): boolean {
	if (!origin) return false;

	try {
		const hostname = new URL(origin).hostname
			.replace(/^www\./, "")
			.toLowerCase();

		if (
			NODE_ENV !== "production" &&
			/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname)
		) {
			return true;
		}

		return whitelist.some(
			(allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`),
		);
	} catch {
		return false;
	}
}
