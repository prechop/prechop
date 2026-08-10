import { APP_URL } from "@/constants/env";

function baseUrl(): string {
	if (typeof window !== "undefined") return window.location.origin;
	return APP_URL.replace(/\/$/, "");
}

export function storeUrl(storeSlug: string): string {
	return `${baseUrl()}/${storeSlug}`;
}

export function listingUrl(shareableToken: string): string {
	return `${baseUrl()}/o/${shareableToken}`;
}

export function storeWhatsAppMessage(
	businessName: string,
	storeSlug: string,
): string {
	return `Check out ${businessName} on Prechop 🍲\nSee what’s available and order here:\n${storeUrl(storeSlug)}`;
}

export function listingWhatsAppMessage({
	businessName,
	title,
	priceLabel,
	remainingQuantity,
	cutoffTime,
	shareableToken,
}: {
	businessName: string;
	title: string;
	priceLabel: string;
	remainingQuantity?: number;
	cutoffTime: string;
	shareableToken: string;
}): string {
	const closes = new Intl.DateTimeFormat(undefined, {
		weekday: "short",
		hour: "numeric",
		minute: "2-digit",
	}).format(new Date(cutoffTime));
	return [
		`${businessName} is cooking 🍲`,
		`${title} — ${priceLabel}`,
		remainingQuantity == null
			? null
			: `${remainingQuantity} portion${remainingQuantity === 1 ? "" : "s"} left`,
		`Orders close ${closes}`,
		`Order here: ${listingUrl(shareableToken)}`,
	]
		.filter(Boolean)
		.join("\n");
}
