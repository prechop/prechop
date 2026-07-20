import "server-only";
import cron from "../constants/cron";
import { connectMongoDB, disconnectMongoDB } from "../databases";
import { disconnectRedis } from "../databases/redis";

declare global {
	// eslint-disable-next-line no-var
	var __prechopBootstrapped: boolean | undefined;
}

function collectSecretProblems(): string[] {
	const required: Array<[string, string | undefined, number]> = [
		["JWT_ACCESS_TOKEN_SECRET", process.env.JWT_ACCESS_TOKEN_SECRET, 32],
		["JWT_REFRESH_TOKEN_SECRET", process.env.JWT_REFRESH_TOKEN_SECRET, 32],
		["ENCRYPTION_KEY", process.env.ENCRYPTION_KEY, 64],
	];
	const problems: string[] = [];
	for (const [name, value, minLen] of required) {
		if (!value || value.length < minLen) {
			problems.push(`${name} missing or shorter than ${minLen} chars`);
		}
	}
	if (
		process.env.JWT_ACCESS_TOKEN_SECRET &&
		process.env.JWT_REFRESH_TOKEN_SECRET &&
		process.env.JWT_ACCESS_TOKEN_SECRET ===
			process.env.JWT_REFRESH_TOKEN_SECRET
	) {
		problems.push(
			"JWT_ACCESS_TOKEN_SECRET and JWT_REFRESH_TOKEN_SECRET must differ",
		);
	}
	return problems;
}

/**
 * A numeric env var that is *set but malformed* is the worst kind: `Number("")`
 * is 0 and `Number("8%")` is NaN, so a typo silently zeroes or NaNs real money
 * instead of crashing. Absence is fine — the documented default applies.
 */
function collectNumericProblem(
	name: string,
	raw: string | undefined,
	max: number,
): string | null {
	if (raw === undefined) return null;
	const trimmed = raw.trim();
	if (!trimmed) {
		return `${name} is set but empty — Number("") is 0, which would silently zero this fee`;
	}
	const parsed = Number(trimmed);
	if (!Number.isFinite(parsed)) {
		return `${name}="${raw}" is not a finite number — fee maths would produce NaN`;
	}
	if (parsed < 0) return `${name}="${raw}" is negative`;
	if (parsed > max) return `${name}="${raw}" exceeds the sane maximum ${max}`;
	return null;
}

/**
 * Env vars whose absence/misconfiguration causes SILENT wrong behaviour in
 * production — the app keeps serving 200s while doing the wrong thing. Each of
 * these has a "helpful" default that is correct for local dev and catastrophic
 * in prod, so the default alone must never be sufficient to boot prod.
 */
function collectSilentFailureProblems(): string[] {
	const problems: string[] = [];

	// APP_URL: baked into Paystack callback_url and receipt links. Validate the
	// RUNTIME origin the server actually resolves (`APP_URL`, falling back to the
	// build-inlined `NEXT_PUBLIC_APP_URL`) — validating `NEXT_PUBLIC_APP_URL`
	// alone tests the BUILD machine's env, a guard that cannot fail on a
	// misconfigured deployment. Defaulting to localhost sends real buyers to a
	// dead host after paying.
	const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
	if (!appUrl) {
		problems.push(
			"APP_URL is unset and its build-time fallback NEXT_PUBLIC_APP_URL is unset too — the server origin defaults to http://localhost:3000, which is baked into Paystack callback URLs and receipt links. Set the runtime APP_URL to the public origin",
		);
	} else if (/localhost|127\.0\.0\.1/i.test(appUrl)) {
		problems.push(
			`the resolved server origin APP_URL="${appUrl}" points at localhost — payment callbacks and receipt links would be dead for real buyers. Set APP_URL to the public origin`,
		);
	}

	// DISABLE_RATE_LIMIT switches off EVERY rate limit globally (read live in
	// rateLimit.ts). It is a local/e2e escape hatch; in production it turns
	// sensitive auth and payment endpoints into open abuse targets. The failure
	// mode is a CI env block copy-pasted into prod, so a truthy value is fatal
	// here, not a silent live read. Match rateLimit.ts's exact truthy set
	// ("1"/"true") so boot and runtime cannot disagree.
	const disableRateLimit = process.env.DISABLE_RATE_LIMIT;
	if (disableRateLimit === "1" || disableRateLimit === "true") {
		problems.push(
			`DISABLE_RATE_LIMIT="${disableRateLimit}" disables ALL rate limiting - never valid in production. Unset it (leave it to a local/e2e environment only)`,
		);
	}

	// Datastores: empty URIs make ioredis quietly fall back to localhost.
	if (!process.env.MONGODB_URI) problems.push("MONGODB_URI is missing");
	if (!process.env.REDIS_URI) {
		problems.push(
			"REDIS_URI is missing — ioredis would silently fall back to 127.0.0.1:6379",
		);
	}

	return problems;
}

/** Config that is merely suspicious: worth surfacing at boot, not fatal. */
function collectWarnings(): string[] {
	const warnings: string[] = [];
	if (process.env.METRICS_ENABLED === "1") {
		warnings.push(
			"METRICS_ENABLED=1 is ignored in production — /api/metrics always requires METRICS_TOKEN there",
		);
	}
	if (process.env.TRUSTED_PROXY !== "1") {
		warnings.push(
			"TRUSTED_PROXY is not set — forwarded-IP headers are client-supplied, so rate limits and IP binding can be spoofed. Set TRUSTED_PROXY=1 when behind a trusted edge/load balancer",
		);
	}
	return warnings;
}

/**
 * Validate runtime config at boot. Throws in production, warns everywhere else
 * — a process that starts with a bad setting and fails at 2am under traffic is
 * strictly worse than one that refuses to start.
 *
 * Exported for tests: it reads `process.env` live on every call, so it can be
 * exercised by mutating env without re-importing the module.
 */
export function assertRuntimeConfig(): void {
	const isProd = process.env.NODE_ENV === "production";
	const problems = [
		...collectSecretProblems(),
		// Fee maths is money: validate the parse in every environment.
		...[
			collectNumericProblem(
				"PLATFORM_FEE_VENDOR_PERCENT",
				process.env.PLATFORM_FEE_VENDOR_PERCENT,
				100,
			),
			collectNumericProblem(
				"PLATFORM_FEE_BUYER_PERCENT",
				process.env.PLATFORM_FEE_BUYER_PERCENT,
				100,
			),
			collectNumericProblem(
				"PLATFORM_FEE_BUYER_MAX_KOBO",
				process.env.PLATFORM_FEE_BUYER_MAX_KOBO,
				Number.MAX_SAFE_INTEGER,
			),
		].filter((p): p is string => p !== null),
		// Silent-failure vars only matter where the defaults are dangerous: prod.
		...(isProd ? collectSilentFailureProblems() : []),
	];

	for (const warning of isProd ? collectWarnings() : []) {
		console.warn(`[bootstrap] ${warning}`);
	}

	if (!problems.length) return;
	const msg = `[bootstrap] Invalid runtime config: ${problems.join("; ")}`;
	if (isProd) throw new Error(msg);
	console.warn(msg);
}

export async function bootstrap(): Promise<void> {
	if (global.__prechopBootstrapped) return;

	// Validate BEFORE marking bootstrapped: a process that fails config must not
	// be able to skip the check on a retry and come up half-configured.
	assertRuntimeConfig();
	global.__prechopBootstrapped = true;

	try {
		await connectMongoDB();
	} catch (error) {
		console.error("[bootstrap] MongoDB connect failed:", error);
	}

	// Ensure the IAM built-in policies & groups exist (idempotent). New vendor/
	// buyer registrations depend on the Vendors/Buyers groups being present.
	try {
		const { seedBuiltInIam } = await import("../services/iam");
		await seedBuiltInIam();
	} catch (error) {
		console.error("[bootstrap] IAM bootstrap failed:", error);
	}

	try {
		await cron();
	} catch (error) {
		console.error("[bootstrap] Cron init failed:", error);
	}

	const shutdown = async () => {
		try {
			await disconnectMongoDB();
		} catch {
			// no-op
		}
		try {
			await disconnectRedis();
		} catch {
			// no-op
		}
	};

	process.once("SIGINT", () => {
		shutdown().finally(() => process.exit(0));
	});
	process.once("SIGTERM", () => {
		shutdown().finally(() => process.exit(0));
	});
}
