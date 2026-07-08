// Client-side display helpers. Money is always integer kobo on the wire.

export function formatKobo(kobo: number): string {
	const naira = (kobo ?? 0) / 100;
	const hasRemainder = (kobo ?? 0) % 100 !== 0;
	return `₦${naira.toLocaleString("en-NG", {
		minimumFractionDigits: hasRemainder ? 2 : 0,
		maximumFractionDigits: 2,
	})}`;
}

export function formatDate(value: string | Date): string {
	const d = typeof value === "string" ? new Date(value) : value;
	return d.toLocaleDateString("en-NG", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

export function formatDateTime(value: string | Date): string {
	const d = typeof value === "string" ? new Date(value) : value;
	return d.toLocaleString("en-NG", {
		day: "numeric",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function timeUntil(value: string | Date): string {
	const d = typeof value === "string" ? new Date(value) : value;
	const diffMs = d.getTime() - Date.now();
	if (diffMs <= 0) return "closed";
	const mins = Math.floor(diffMs / 60000);
	if (mins < 60) return `${mins}m left`;
	const hrs = Math.floor(mins / 60);
	if (hrs < 24) return `${hrs}h ${mins % 60}m left`;
	return `${Math.floor(hrs / 24)}d left`;
}

export function statusLabel(status: string): string {
	return status
		.toLowerCase()
		.split("_")
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ");
}
