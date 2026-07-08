import { verify } from "jsonwebtoken";
import type { IJwtPayload } from "../types";
import {
	JWT_ACCESS_TOKEN_SECRET,
	JWT_REFRESH_TOKEN_SECRET,
} from "./environments";
import { ErrInvalidAction } from "./errors";

export default async function decodeJwtToken({
	accessToken,
	refreshToken,
}: {
	accessToken?: string;
	refreshToken?: string;
}): Promise<IJwtPayload | null> {
	try {
		if (!accessToken && !refreshToken) throw ErrInvalidAction;

		const token = accessToken ?? refreshToken ?? "";
		const secret = accessToken
			? JWT_ACCESS_TOKEN_SECRET
			: JWT_REFRESH_TOKEN_SECRET;

		// SECURITY: pin the algorithm to HS256. Without this an attacker could
		// exploit the algorithm-confusion bug class.
		const { data: decodedToken } = verify(token, secret, {
			algorithms: ["HS256"],
		}) as { data: IJwtPayload };

		if (!decodedToken) throw ErrInvalidAction;

		const result: IJwtPayload = {
			userId: decodedToken.userId,
			ip: decodedToken.ip,
			date: new Date(decodedToken.date),
			accessToken: decodedToken.accessToken ?? accessToken ?? "",
			expiresIn: new Date(decodedToken.expiresIn),
			refreshToken: decodedToken.refreshToken ?? refreshToken ?? "",
			refreshTokenExpiresIn: new Date(decodedToken.refreshTokenExpiresIn),
		};

		if (accessToken) {
			const isExpired = Date.now() - new Date(result.expiresIn).getTime();
			if (isExpired >= 0) throw ErrInvalidAction;
		}

		return result;
	} catch {
		throw ErrInvalidAction;
	}
}
