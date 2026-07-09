import { ErrInvalidFields } from "@/server/constants";
import {
	assertVendor,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { DayOfWeek } from "@/server/models";
import { getDayTemplate } from "@/server/services/timetable";

export const runtime = "nodejs";

/**
 * Open timetable entries (joined with menu items) for a given weekday. Powers
 * the daily-order composer's "seed from timetable" for the selected date's day.
 */
export const GET = withApiHandler(
	{ route: "/api/timetable/template" },
	withAuth(async ({ req, auth }) => {
		try {
			assertVendor(auth);
			const day = new URL(req.url).searchParams.get("dayOfWeek");
			if (!day || !Object.values(DayOfWeek).includes(day as DayOfWeek))
				throw ErrInvalidFields;
			const entries = await getDayTemplate({
				userId: auth.userId,
				dayOfWeek: day as DayOfWeek,
			});
			return ok(entries);
		} catch (e) {
			return handleError(e);
		}
	}),
);
