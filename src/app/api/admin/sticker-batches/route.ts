import { ErrInvalidFields } from "@/server/constants";
import {
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import {
	createStickerBatchDB,
	listStickerBatchesByVendorDB,
} from "@/server/models";
import { requirePermission } from "@/server/lib";
import { type CreateStickerBatchInput, createStickerBatchSchema } from "@/server/validators/admin/validate";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/admin/sticker-batches" },
	withAuth(async ({ auth, req }) => {
		try {
			requirePermission(auth, "vendor:read");
			const { searchParams } = new URL(req.url);
			const vendorId = searchParams.get("vendorId") || undefined;
			if (!vendorId) {
				return handleError(new Error("vendorId is required"));
			}
			const batches = await listStickerBatchesByVendorDB({ vendorId });
			return ok(batches);
		} catch (e) {
			return handleError(e);
		}
	}),
);

export const POST = withApiHandler(
	{ route: "/api/admin/sticker-batches" },
	withAuth(async ({ req, auth }) => {
		try {
			requirePermission(auth, "vendor:update");
			const parsed = createStickerBatchSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const batch = await createStickerBatchDB({
				payload: parsed.data as CreateStickerBatchInput,
			});
			return ok(batch);
		} catch (e) {
			return handleError(e);
		}
	}),
);
