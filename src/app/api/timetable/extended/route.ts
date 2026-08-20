import {
	assertVendor,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { getExtendedTimetable } from "@/server/services/timetable/extendedQueries";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/timetable/extended" },
	withAuth(async ({ auth }) => {
		try {
			assertVendor(auth);
			const entries = await getExtendedTimetable({ userId: auth.userId });
			return ok(entries);
		} catch (e) {
			return handleError(e);
		}
	}),
);
