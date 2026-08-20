import {
	getVendorProfileByStoreSlugDB,
	type IVendorProfile,
	listVendorProfilesForStoreSlugFallbackDB,
	updateVendorProfileDB,
} from "@/server/models";
import { resolveVendorByUserId, vendorIdOf } from "./resolveVendor";

const RESERVED_STORE_SLUGS = new Set([
	"admin",
	"api",
	"account",
	"dashboard",
	"earnings",
	"feed",
	"help",
	"login",
	"marketplace",
	"menu",
	"my-orders",
	"notifications",
	"o",
	"order",
	"pay",
	"pipeline",
	"policies",
	"privacy",
	"receipt",
	"register",
	"sell",
	"terms",
	"timetable",
	"v",
	"vendor",
]);

export function storeSlugBase(value: string): string {
	const slug = value
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[’']/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 70)
		.replace(/-+$/g, "");
	if (!slug || RESERVED_STORE_SLUGS.has(slug))
		return `${slug || "kitchen"}-store`;
	return slug;
}

export async function ensureVendorStoreSlug({
	userId,
}: {
	userId: string;
}): Promise<IVendorProfile> {
	const vendor = await resolveVendorByUserId({ userId });
	if (vendor.storeSlug) return vendor;

	const vendorId = vendorIdOf(vendor);
	const base = storeSlugBase(vendor.businessName ?? "kitchen");
	for (let suffix = 1; suffix <= 100; suffix += 1) {
		const candidate = suffix === 1 ? base : `${base}-${suffix}`;
		const existing = await getVendorProfileByStoreSlugDB({
			storeSlug: candidate,
		});
		if (existing && vendorIdOf(existing) !== vendorId) continue;
		const updated = await updateVendorProfileDB({
			id: vendorId,
			payload: { storeSlug: candidate },
		});
		if (updated?.storeSlug === candidate) return updated;
	}
	throw new Error("Could not create a unique store link.");
}

export async function resolveVendorByStoreSlug({
	storeSlug,
}: {
	storeSlug: string;
}): Promise<IVendorProfile | null> {
	const normalized = storeSlug.trim().toLowerCase();
	const exact = await getVendorProfileByStoreSlugDB({
		storeSlug: normalized,
	});
	if (exact) return exact;

	const vendors = await listVendorProfilesForStoreSlugFallbackDB();
	return (
		vendors.find(
			(vendor) =>
				storeSlugBase(vendor.businessName ?? "kitchen") === normalized,
		) ?? null
	);
}
