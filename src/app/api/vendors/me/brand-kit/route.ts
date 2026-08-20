import { ErrInvalidFields } from "@/server/constants";
import {
	assertActiveVendor,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import {
	confirmBrandKitReceipt,
	getBrandKitStatus,
	initiateBrandKitPayment,
} from "@/server/services/vendors/brandKitPayment";
import { initiateBrandKitPaymentSchema } from "@/server/validators/vendors/validate";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/vendors/me/brand-kit" },
	withAuth(async ({ auth }) => {
		try {
			assertActiveVendor(auth);
			const status = await getBrandKitStatus({ userId: auth.userId });
			return ok(status);
		} catch (e) {
			return handleError(e);
		}
	}),
);

export const POST = withApiHandler(
	{ route: "/api/vendors/me/brand-kit" },
	withAuth(async ({ req, auth }) => {
		try {
			assertActiveVendor(auth);
			const parsed = initiateBrandKitPaymentSchema.safeParse(
				await req.json(),
			);
			if (!parsed.success) throw ErrInvalidFields;
			const result = await initiateBrandKitPayment({
				userId: auth.userId,
				amountKobo: parsed.data.amountKobo ?? 0,
			});
			if (!result) {
				return handleError(
					new Error("Failed to initiate Brand Kit payment"),
				);
			}
			return ok(result);
		} catch (e) {
			return handleError(e);
		}
	}),
);

export const PATCH = withApiHandler(
	{ route: "/api/vendors/me/brand-kit" },
	withAuth(async ({ auth }) => {
		try {
			assertActiveVendor(auth);
			const result = await confirmBrandKitReceipt({
				userId: auth.userId,
			});
			return ok(result);
		} catch (e) {
			return handleError(e);
		}
	}),
);
