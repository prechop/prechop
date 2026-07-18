// import clientAppURLs from "./clientAppURLs";
// import { NODE_ENV } from "./environments";

// const whitelist = clientAppURLs.map((item) => item.url);

// export default function isOriginAllowed(origin: string | undefined): boolean {
// 	if (!origin) return false;

// 	// Allow local network IPs in development only (for mobile testing).
// 	if (NODE_ENV !== "production") {
// 		const rawHost = origin.replace(/^https?:\/\//, "").replace(/:\d+$/, "");
// 		if (/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(rawHost)) {
// 			return true;
// 		}
// 	}

// 	// Strip protocol/www, port, and subdomains down to the root eTLD+1.
// 	const originWithoutPort = origin
// 		.replace(/:\d+$/, "")
// 		.replace(/^https?:\/\/(www\.)?/, "")
// 		.split(".")
// 		.slice(-2)
// 		.join(".");

// 	return whitelist.some((allowed) => originWithoutPort === allowed);
// }





import clientAppURLs from "./clientAppURLs";
import { NODE_ENV } from "./environments";

const whitelist = clientAppURLs.map(({ url }) =>
  url
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/:\d+$/, "")
    .toLowerCase(),
);

export default function isOriginAllowed(
  origin: string | undefined,
): boolean {
  if (!origin) return false;

  try {
    const hostname = new URL(origin).hostname
      .replace(/^www\./, "")
      .toLowerCase();

    // Allow local-network IPs only during development.
    if (
      NODE_ENV !== "production" &&
      /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname)
    ) {
      return true;
    }

    return whitelist.includes(hostname);
  } catch {
    return false;
  }
}