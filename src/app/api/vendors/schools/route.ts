import { handleError, ok, withApiHandler, withAuth } from "@/server/lib";
import { listVendorSchools } from "@/server/services/vendors";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/vendors/schools" },
	withAuth(async () => {
		try {
			const schools = await listVendorSchools();
			return ok(schools);
		} catch (e) {
			return handleError(e);
		}
	}),
);
