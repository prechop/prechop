import { ErrInvalidFields } from "@/server/constants";
import {
	assertActiveVendor,
	assertVendor,
	created,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { createOptionGroup, listOptionGroups } from "@/server/services/menu";
import { createOptionGroupSchema } from "@/server/validators/menu/optionGroups";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/menu/option-groups" },
	withAuth(async ({ auth }) => {
		try {
			assertVendor(auth);
			const groups = await listOptionGroups({ userId: auth.userId });
			return ok(groups);
		} catch (e) {
			return handleError(e);
		}
	}),
);

export const POST = withApiHandler(
	{ route: "/api/menu/option-groups" },
	withAuth(async ({ req, auth }) => {
		try {
			await assertActiveVendor(auth);
			const parsed = createOptionGroupSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const group = await createOptionGroup({
				userId: auth.userId,
				...parsed.data,
			});
			return created(group);
		} catch (e) {
			return handleError(e);
		}
	}),
);
