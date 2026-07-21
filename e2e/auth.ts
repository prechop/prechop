import type {
	APIRequest,
	APIRequestContext,
	BrowserContext,
} from "@playwright/test";
import { connectMongoDB } from "../src/server/databases/mongoDB";
import { getUserByEmailDB, loginUserDB } from "../src/server/models/users";
import { BASE_URL, ORIGIN } from "./urls";

export const ADMIN_EMAIL =
	process.env.SEED_ADMIN_EMAIL ?? "prechopofficial@gmail.com";
export const BUYER_EMAIL = "ada.obi.buyers@seed.prechop.local";
export const VENDOR_EMAIL = "tunde.bakare.vendors@seed.prechop.local";
export const BOLA_VENDOR_EMAIL = "bola.adeyemi.vendors@seed.prechop.local";

async function sessionForEmail(email: string) {
	await connectMongoDB();
	const user = await getUserByEmailDB({ email });
	if (!user) throw new Error(`[e2e] Seeded user not found: ${email}`);

	const token = await loginUserDB({
		id: user._id.toString(),
		ip: "127.0.0.1",
	});
	if (!token) throw new Error(`[e2e] Could not create session for ${email}`);
	return token;
}

export async function authenticatedRequest(
	request: APIRequest,
	email: string,
): Promise<APIRequestContext> {
	const token = await sessionForEmail(email);
	return request.newContext({
		baseURL: BASE_URL,
		extraHTTPHeaders: {
			origin: ORIGIN,
			authorization: `Bearer ${token.accessToken}`,
		},
	});
}

export async function authenticateBrowserContext(
	context: BrowserContext,
	email: string,
) {
	const token = await sessionForEmail(email);
	await context.addCookies([
		{
			name: "__Host-accessToken",
			value: token.accessToken,
			url: BASE_URL,
			httpOnly: true,
			secure: true,
			sameSite: "Strict",
			expires: Math.floor(token.expiresIn.getTime() / 1000),
		},
		{
			name: "__Host-refreshToken",
			value: token.refreshToken,
			url: BASE_URL,
			httpOnly: true,
			secure: true,
			sameSite: "Strict",
			expires: Math.floor(token.refreshTokenExpiresIn.getTime() / 1000),
		},
	]);
}
