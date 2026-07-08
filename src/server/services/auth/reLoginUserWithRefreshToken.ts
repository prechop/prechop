import { reLoginUserWithRefreshTokenDB } from "../../models";

export default async function reLoginUserWithRefreshToken({
	id,
	refreshToken,
	ip,
}: {
	id: string;
	refreshToken: string;
	ip: string;
}): Promise<ReturnType<typeof reLoginUserWithRefreshTokenDB>> {
	const result = await reLoginUserWithRefreshTokenDB({
		id,
		refreshToken,
		ip,
	});
	if (!result) return null;
	return result;
}
