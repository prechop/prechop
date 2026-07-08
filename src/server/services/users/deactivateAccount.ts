import { setUserActiveDB } from "../../models";

/** Soft-deactivate the authenticated user's account. */
export async function deactivateAccount({
	userId,
}: {
	userId: string;
}): Promise<{ success: boolean }> {
	const success = await setUserActiveDB({ id: userId, isActive: false });
	return { success };
}
