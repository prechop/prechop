import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
	vi.unstubAllEnvs();
	vi.resetModules();
});

describe("production authentication cookies", () => {
	it("uses secure host-only __Host cookies and persists a refreshed pair", async () => {
		vi.stubEnv("NODE_ENV", "production");
		vi.stubEnv("COOKIE_DOMAIN", "example.invalid");
		const { NextResponse } = await import("next/server");
		const {
			ACCESS_COOKIE,
			REFRESH_COOKIE,
			getAuthCookieOptions,
			setAuthCookiesOnResponse,
		} = await import("@/server/lib/cookies");
		const options = getAuthCookieOptions();
		expect(ACCESS_COOKIE).toBe("__Host-accessToken");
		expect(REFRESH_COOKIE).toBe("__Host-refreshToken");
		expect(options).toMatchObject({
			httpOnly: true,
			secure: true,
			sameSite: "lax",
			path: "/",
		});
		expect(options).not.toHaveProperty("domain");

		const now = Date.now();
		const response = NextResponse.json({ ok: true });
		setAuthCookiesOnResponse(response, {
			userId: "user-id",
			ip: "",
			date: new Date(now),
			expiresIn: new Date(now + 15 * 60_000),
			refreshTokenExpiresIn: new Date(now + 7 * 24 * 60 * 60_000),
			refreshTokenAbsoluteExpiresIn: new Date(
				now + 30 * 24 * 60 * 60_000,
			),
			accessToken: "access-jwt",
			refreshToken: "refresh-jwt",
		});
		const setCookie = response.headers.get("set-cookie") ?? "";
		expect(setCookie).toContain("__Host-accessToken=access-jwt");
		expect(setCookie).toContain("__Host-refreshToken=refresh-jwt");
		expect(setCookie).toContain("HttpOnly");
		expect(setCookie).toContain("Secure");
		expect(setCookie).toContain("SameSite=lax");
		expect(setCookie).not.toContain("Domain=");
	});
});
