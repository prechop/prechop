import { ErrInvalidFields } from "@/server/constants";
import {
	assertVendor,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { getTimetableForDay } from "@/server/services/timetable";
import { dayOfWeekParamSchema } from "@/server/validators/timetable/validate";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/timetable/day/[dayOfWeek]" },
	withAuth(async ({ auth, context }) => {
		try {
			assertVendor(auth);
			const { dayOfWeek } = await (
				context as { params: Promise<{ dayOfWeek: string }> }
			).params;
			const parsed = dayOfWeekParamSchema.safeParse({ dayOfWeek });
			if (!parsed.success) throw ErrInvalidFields;
			const entries = await getTimetableForDay({
				userId: auth.userId,
				dayOfWeek: parsed.data.dayOfWeek,
			});
			return ok(entries);
		} catch (e) {
			return handleError(e);
		}
	}),
);
