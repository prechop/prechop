import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "@/proxy";

function request(path: string, cookie?: string): NextRequest {
	return new NextRequest(`https://www.prechop.com.ng${path}`, {
		headers: cookie ? { cookie } : undefined,
	});
}

describe("proxy session refresh routing", () => {
	it("refreshes protected pages when only the refresh session remains", async () => {
		const response = await proxy(
			request("/my-orders/123?tab=active", "refreshToken=live"),
		);

		expect(response.headers.get("location")).toBe(
			"https://www.prechop.com.ng/api/auth/refresh?next=%2Fmy-orders%2F123%3Ftab%3Dactive",
		);
	});

	it("refreshes login next redirects before treating the user as logged out", async () => {
		const response = await proxy(
			request("/login?next=%2Fadmin", "refreshToken=live"),
		);

		expect(response.headers.get("location")).toBe(
			"https://www.prechop.com.ng/api/auth/refresh?next=%2Fadmin",
		);
	});

	it("still sends anonymous protected requests to login", async () => {
		const response = await proxy(request("/account"));

		expect(response.headers.get("location")).toBe(
			"https://www.prechop.com.ng/login?next=%2Faccount",
		);
	});
});
