import crypto from "node:crypto";

const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/**
 * Generate a unique 3-character vendor short ID from a business name.
 * Collision avoidance: retries with alternate character combinations.
 */
export function generateVendorShortId(
	businessName: string,
	checkUnique: (id: string) => Promise<boolean>,
): Promise<string> {
	return new Promise((resolve, reject) => {
		const raw = (businessName || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
		const base = raw.slice(0, 3).padEnd(3, "X");
		const candidates = [base];

		if (base.length >= 2) {
			for (let i = 0; i < 26; i += 1) {
				const c = String.fromCharCode(65 + i);
				candidates.push(`${base[0]}${base[1]}${c}`);
				candidates.push(`${base[0]}${c}${base[2]}`);
			}
		}
		candidates.push(
			crypto.randomBytes(2).toString("hex").toUpperCase().slice(0, 3),
		);

		let idx = 0;
		function tryNext() {
			if (idx >= candidates.length) {
				reject(new Error("failed to generate unique vendor short ID"));
				return;
			}
			const candidate = candidates[idx];
			idx += 1;
			checkUnique(candidate).then((unique) => {
				if (unique) resolve(candidate);
				else tryNext();
			});
		}
		tryNext();
	});
}
