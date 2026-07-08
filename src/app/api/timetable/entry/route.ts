import { ErrInvalidFields } from "@/server/constants";
import {
	assertVendor,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import {
	deleteTimetableEntry,
	upsertTimetableEntry,
} from "@/server/services/timetable";
import {
	deleteEntrySchema,
	upsertEntrySchema,
} from "@/server/validators/timetable/validate";

export const runtime = "nodejs";

export const PUT = withApiHandler(
	{ route: "/api/timetable/entry" },
	withAuth(async ({ req, auth }) => {
		try {
			assertVendor(auth);
			const parsed = upsertEntrySchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const result = await upsertTimetableEntry({
				userId: auth.userId,
				...parsed.data,
			});
			return ok(result);
		} catch (e) {
			return handleError(e);
		}
	}),
);

export const DELETE = withApiHandler(
	{ route: "/api/timetable/entry" },
	withAuth(async ({ req, auth }) => {
		try {
			assertVendor(auth);
			const parsed = deleteEntrySchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const result = await deleteTimetableEntry({
				userId: auth.userId,
				id: parsed.data.id,
			});
			return ok(result);
		} catch (e) {
			return handleError(e);
		}
	}),
);
