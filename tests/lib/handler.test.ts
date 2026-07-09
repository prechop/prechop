import type { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DB_NAME } from "@/server/constants/environments";
import { validationError } from "@/server/constants/errors";
import { Redis } from "@/server/databases/redis";
import { withApiHandler } from "@/server/lib/handler";
import { ok } from "@/server/lib/response";
import { connectTestDB, dropAndDisconnect } from "../helpers/db";

const rlKeys = new Set<string>();

beforeAll(async () => {
	await connectTestDB();
});

afterAll(async () => {
	if (rlKeys.size) await Redis.del(...rlKeys);
	await dropAndDisconnect();
});

function nextReq(
	headers: Record<string, string> = {},
	method = "GET",
): NextRequest {
	return new Request("https://prechop.ng/api/x", {
		method,
		headers,
	}) as unknown as NextRequest;
}

describe("withApiHandler", () => {
	it("runs the handler and applies rate-limit headers on success", async () => {
		const ip = `8.8.8.${Math.floor(Math.random() * 255)}`;
		rlKeys.add(`rate-limit:${DB_NAME}:${ip}`);
		const wrapped = withApiHandler(
			{
				route: "/api/x",
				rateLimit: { windowMs: 60_000, maxRequests: 10 },
			},
			async () => ok({ hello: true }),
		);
		const res = await wrapped(nextReq({ "x-real-ip": ip }), {});
		expect(res.status).toBe(200);
		expect(res.headers.get("X-RateLimit-Limit")).toBeTruthy();
		expect(await res.json()).toEqual({
			code: 200,
			message: null,
			data: { hello: true },
		});
	});

	it("blocks a CSRF-invalid unsafe request with 403", async () => {
		const wrapped = withApiHandler(
			{ route: "/api/x", rateLimit: false },
			async () => ok({ ok: true }),
		);
		const res = await wrapped(
			nextReq({ origin: "https://evil.com" }, "POST"),
			{},
		);
		expect(res.status).toBe(403);
	});

	it("maps a thrown domain error to its status", async () => {
		const wrapped = withApiHandler(
			{ route: "/api/x", rateLimit: false },
			async () => {
				throw validationError("bad body");
			},
		);
		const res = await wrapped(nextReq(), {});
		expect(res.status).toBe(400);
	});

	it("can skip CSRF for webhook-style routes", async () => {
		const wrapped = withApiHandler(
			{ route: "/api/webhook", rateLimit: false, csrf: false },
			async () => ok({ received: true }),
		);
		const res = await wrapped(nextReq({}, "POST"), {});
		expect(res.status).toBe(200);
	});
});
