import {
	assertVendor,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { getTodayTemplate } from "@/server/services/timetable";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/timetable/today-template" },
	withAuth(async ({ auth }) => {
		try {
			assertVendor(auth);
			const entries = await getTodayTemplate({ userId: auth.userId });
			return ok(entries);
		} catch (e) {
			return handleError(e);
		}
	}),
);
