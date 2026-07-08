// Used by isOriginAllowed for the "trusted origin" rate-limit bonus and CSRF
// allow-list. The matcher collapses to the last two domain labels, so each
// entry effectively whitelists every subdomain of that eTLD+1.
const clientAppURLs: { url: string }[] = [
	{ url: "localhost" },
	{ url: "prechop.ng" },
];

export default clientAppURLs;
