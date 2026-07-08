import {
	assertVendor,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { getTimetable } from "@/server/services/timetable";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/timetable" },
	withAuth(async ({ auth }) => {
		try {
			assertVendor(auth);
			const entries = await getTimetable({ userId: auth.userId });
			return ok(entries);
		} catch (e) {
			return handleError(e);
		}
	}),
);
