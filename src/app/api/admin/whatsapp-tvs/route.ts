import { ErrInvalidFields } from "@/server/constants";
import {
	assertAdmin,
	created,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { createWhatsappTv, listWhatsappTvs } from "@/server/services/admin";
import {
	createWhatsappTvSchema,
	whatsappTvsQuerySchema,
} from "@/server/validators/admin/validate";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/admin/whatsapp-tvs" },
	withAuth(async ({ req, auth }) => {
		try {
			assertAdmin(auth);
			const url = new URL(req.url);
			const parsed = whatsappTvsQuerySchema.safeParse(
				Object.fromEntries(url.searchParams),
			);
			if (!parsed.success) throw ErrInvalidFields;
			const tvs = await listWhatsappTvs(parsed.data.campusId);
			return ok(tvs);
		} catch (error) {
			return handleError(error);
		}
	}),
);

export const POST = withApiHandler(
	{ route: "/api/admin/whatsapp-tvs" },
	withAuth(async ({ req, auth }) => {
		try {
			assertAdmin(auth);
			const parsed = createWhatsappTvSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const tv = await createWhatsappTv(parsed.data);
			return created(tv, "WhatsApp TV created");
		} catch (error) {
			return handleError(error);
		}
	}),
);
