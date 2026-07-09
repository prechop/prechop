import { ErrInvalidFields } from "@/server/constants";
import {
	assertActiveVendor,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { deleteOptionGroup, updateOptionGroup } from "@/server/services/menu";
import { updateOptionGroupSchema } from "@/server/validators/menu/optionGroups";

export const runtime = "nodejs";

export const PATCH = withApiHandler(
	{ route: "/api/menu/option-groups/[groupId]" },
	withAuth(async ({ req, auth, context }) => {
		try {
			await assertActiveVendor(auth);
			const { groupId } = await (
				context as { params: Promise<{ groupId: string }> }
			).params;
			const parsed = updateOptionGroupSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const group = await updateOptionGroup({
				userId: auth.userId,
				groupId,
				...parsed.data,
			});
			return ok(group);
		} catch (e) {
			return handleError(e);
		}
	}),
);

export const DELETE = withApiHandler(
	{ route: "/api/menu/option-groups/[groupId]" },
	withAuth(async ({ auth, context }) => {
		try {
			await assertActiveVendor(auth);
			const { groupId } = await (
				context as { params: Promise<{ groupId: string }> }
			).params;
			const result = await deleteOptionGroup({
				userId: auth.userId,
				groupId,
			});
			return ok(result);
		} catch (e) {
			return handleError(e);
		}
	}),
);
