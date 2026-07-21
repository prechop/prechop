import { describe, expect, it } from "vitest";
import hash from "@/server/constants/hash";
import hashToken from "@/server/constants/hashToken";
import isOriginAllowed from "@/server/constants/isOriginAllowed";

describe("hash", () => {
	it("is a deterministic 64-char sha256 hex", () => {
		expect(hash("abc")).toBe(hash("abc"));
		expect(hash("abc")).toMatch(/^[0-9a-f]{64}$/);
	});

	it("differs for different inputs", () => {
		expect(hash("abc")).not.toBe(hash("abd"));
	});
});

describe("hashToken", () => {
	it("is deterministic and 64-char hex", () => {
		expect(hashToken("tok")).toBe(hashToken("tok"));
		expect(hashToken("tok")).toMatch(/^[0-9a-f]{64}$/);
	});

	it("differs for different tokens", () => {
		expect(hashToken("a")).not.toBe(hashToken("b"));
	});
});

describe("isOriginAllowed", () => {
	it("returns false for undefined/empty origin", () => {
		expect(isOriginAllowed(undefined)).toBe(false);
		expect(isOriginAllowed("")).toBe(false);
	});

	it("allows whitelisted eTLD+1 and its subdomains", () => {
		expect(isOriginAllowed("https://prechop.com.ng")).toBe(true);
		expect(isOriginAllowed("https://www.prechop.com.ng")).toBe(true);
		expect(isOriginAllowed("https://app.prechop.com.ng")).toBe(true);
		expect(isOriginAllowed("https://prechop.com.ng:3000")).toBe(true);
	});

	it("allows localhost", () => {
		expect(isOriginAllowed("http://localhost:3000")).toBe(true);
	});

	it("rejects non-whitelisted origins", () => {
		expect(isOriginAllowed("https://evil.com")).toBe(false);
		expect(isOriginAllowed("https://prechop.com.ng.evil.com")).toBe(false);
	});

	it("allows local network IPs outside production (test env)", () => {
		expect(isOriginAllowed("http://192.168.1.5:3000")).toBe(true);
		expect(isOriginAllowed("http://10.0.0.2")).toBe(true);
		expect(isOriginAllowed("http://172.16.0.1")).toBe(true);
	});
});
