import { notFound } from "@/server/constants";
import { handleError, ok, withApiHandler } from "@/server/lib";
import { getPublicTimetable } from "@/server/services/timetable/extendedQueries";
import { VendorStatus } from "@/server/models";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/timetable/public/[vendorId]" },
	async ({ context }) => {
		try {
			const { vendorId } = await (
				context as { params: Promise<{ vendorId: string }> }
			).params;
			const entries = await getPublicTimetable({ vendorId });
			return ok(entries);
		} catch (e) {
			return handleError(e);
		}
	},
);
