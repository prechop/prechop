import {
	assertVendor,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { listVendorWhatsappTvs } from "@/server/services/whatsappTvs";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/vendors/whatsapp-tvs" },
	withAuth(async ({ auth }) => {
		try {
			assertVendor(auth);
			return ok(await listVendorWhatsappTvs({ campusId: auth.campusId }));
		} catch (e) {
			return handleError(e);
		}
	}),
);
