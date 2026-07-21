import { expect, test } from "@playwright/test";

// End-to-end smoke coverage for the merged Prechop app. These exercise the
// real server (started by Playwright's webServer) against the seeded local
// Mongo + Redis: run `pnpm seed` first. They cover the public read path
// (DB → API → rendered page), the auth guard, health, and the OTP login step.
// The OTP code itself is only ever stored hashed, so a full black-box login is
// intentionally not automatable — we assert the flow reaches the code step.

test.describe("health & readiness", () => {
	test("GET /api/health reports mongo + redis up", async ({ request }) => {
		const res = await request.get("/api/health");
		expect(res.status()).toBe(200);
		const body = await res.json();
		expect(body.status).toBe("ok");
		expect(body.checks.mongo).toBe("ok");
		expect(body.checks.redis).toBe("ok");
	});
});

test.describe("public pages", () => {
	test("landing renders the brand and primary CTAs", async ({ page }) => {
		await page.goto("/");
		await expect(
			page.getByRole("heading", { name: /reserve your meal/i }),
		).toBeVisible();
		await expect(
			page.getByRole("link", { name: /browse food/i }),
		).toBeVisible();
		await expect(
			page.getByRole("link", { name: /become a vendor/i }),
		).toBeVisible();
	});

	test("unified login shows the passwordless account choices", async ({
		page,
	}) => {
		await page.goto("/login");
		await expect(
			page.getByRole("heading", { name: /continue to prechop/i }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: /continue with google/i }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: /continue with email/i }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: /sell on prechop/i }),
		).toBeVisible();
	});

	test("vendor application (/sell) shows the business fields", async ({
		page,
	}) => {
		await page.goto("/sell");
		await expect(
			page.getByRole("heading", { name: /sell on prechop/i }),
		).toBeVisible();
		await expect(page.getByPlaceholder("Ada's Kitchen")).toBeVisible();
		await expect(page.getByPlaceholder("you@example.com")).toBeVisible();
	});
});

test.describe("auth guard", () => {
	test("unauthenticated /my-orders redirects to /login", async ({ page }) => {
		await page.goto("/my-orders");
		await page.waitForURL(/\/login/);
		expect(page.url()).toContain("/login");
	});
});

test.describe("public read path (seeded data)", () => {
	test("a seeded live listing renders on its public order page", async ({
		page,
		request,
	}) => {
		// Discover a campus, then a live listing token, purely via public APIs.
		const campusesRes = await request.get("/api/campuses");
		expect(campusesRes.ok()).toBeTruthy();
		const campuses = (await campusesRes.json()).data as Array<{
			id: string;
			shortCode: string;
		}>;
		const campus =
			campuses.find((c) => c.shortCode === "UNILAG") ?? campuses[0];
		expect(campus, "seed must create at least one campus").toBeTruthy();

		const marketRes = await request.get(
			`/api/daily-orders/marketplace?campusId=${campus.id}&limit=20`,
		);
		expect(marketRes.ok()).toBeTruthy();
		// `/marketplace` returns listings GROUPED BY VENDOR, not a flat list.
		// This test used to read `data[0].title` off the group — always
		// `undefined` — and then asserted `getByRole("heading", { name:
		// undefined })`, which matches ANY heading and so could never fail. It
		// "passed" against a marketplace containing zero listings.
		const groups = (await marketRes.json()).data as Array<{
			vendor: { businessName: string };
			listings: Array<{ shareableToken: string; title: string }>;
		}>;
		const group = groups.find((g) => g.listings.length > 0);
		expect(
			group,
			"seed must create at least one ACTIVE daily order with a future cutoff",
		).toBeTruthy();

		if (!group) throw new Error("seed marketplace has no live listings");
		const listing = group.listings[0];
		// Guard the guard: an undefined title would make the heading assertion
		// below vacuous again.
		expect(listing.title, "listing must carry a title").toBeTruthy();
		expect(
			listing.shareableToken,
			"listing must carry a token",
		).toBeTruthy();

		await page.goto(`/o/${listing.shareableToken}`);

		// The listing title + at least one menu item render, and an
		// unauthenticated visitor is prompted to log in before paying.
		await expect(
			page.getByRole("heading", { name: listing.title }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: /log in to order/i }),
		).toBeVisible();
	});
});
