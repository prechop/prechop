import { ErrInvalidFields } from "@/server/constants";
import {
	assertVendor,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { upsertTimetableEntries } from "@/server/services/timetable";
import { bulkEntriesSchema } from "@/server/validators/timetable/validate";

export const runtime = "nodejs";

export const PUT = withApiHandler(
	{ route: "/api/timetable/entries" },
	withAuth(async ({ req, auth }) => {
		try {
			assertVendor(auth);
			const parsed = bulkEntriesSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const result = await upsertTimetableEntries({
				userId: auth.userId,
				entries: parsed.data.entries,
			});
			return ok(result);
		} catch (e) {
			return handleError(e);
		}
	}),
);
