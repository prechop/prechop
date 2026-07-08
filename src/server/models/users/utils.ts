import { sign } from "jsonwebtoken";
import {
	ACCESS_TOKEN_MAX_AGE_SECONDS,
	JWT_ACCESS_TOKEN_SECRET,
	JWT_REFRESH_TOKEN_SECRET,
	REFRESH_TOKEN_MAX_AGE_SECONDS,
} from "../../constants";
import type { IJwtPayload } from "../../types";

export async function generateAuthToken({
	userId,
	ip,
	shouldRegenerateRefreshToken,
}: {
	userId: string;
	ip: string;
	shouldRegenerateRefreshToken: boolean;
}): Promise<IJwtPayload | null> {
	try {
		const currentDate = new Date();
		const expirationDate = new Date(
			Date.now() + ACCESS_TOKEN_MAX_AGE_SECONDS * 1000,
		);
		const refreshTokenExpiresIn = new Date(
			Date.now() + REFRESH_TOKEN_MAX_AGE_SECONDS * 1000,
		);

		let refreshToken = "";
		if (shouldRegenerateRefreshToken) {
			const payload: IJwtPayload = {
				userId,
				date: currentDate,
				accessToken: "",
				expiresIn: expirationDate,
				ip,
				refreshToken: "",
				refreshTokenExpiresIn,
			};
			const signed = sign({ data: payload }, JWT_REFRESH_TOKEN_SECRET, {
				algorithm: "HS256",
				expiresIn: REFRESH_TOKEN_MAX_AGE_SECONDS,
			});
			if (!signed) return null;
			refreshToken = signed;
		}

		const jwtSigningPayload = {
			userId,
			date: currentDate,
			expiresIn: expirationDate,
			ip,
			refreshTokenExpiresIn,
		};
		const accessToken = sign(
			{ data: jwtSigningPayload },
			JWT_ACCESS_TOKEN_SECRET,
			{ algorithm: "HS256", expiresIn: ACCESS_TOKEN_MAX_AGE_SECONDS },
		);

		return { ...jwtSigningPayload, accessToken, refreshToken };
	} catch {
		return null;
	}
}
