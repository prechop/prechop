import {
	assertVendor,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { listBanks } from "@/server/services/vendors";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/vendors/banks" },
	withAuth(async ({ auth }) => {
		try {
			assertVendor(auth);
			const banks = await listBanks();
			return ok(banks);
		} catch (e) {
			return handleError(e);
		}
	}),
);
