import "server-only";
import cron from "../constants/cron";
import { connectMongoDB, disconnectMongoDB } from "../databases";
import { disconnectRedis } from "../databases/redis";

declare global {
	// eslint-disable-next-line no-var
	var __prechopBootstrapped: boolean | undefined;
}

function assertSecrets(): void {
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
	if (!problems.length) return;
	const msg = `[bootstrap] Insecure secret config: ${problems.join("; ")}`;
	if (process.env.NODE_ENV === "production") throw new Error(msg);
	console.warn(msg);
}

export async function bootstrap(): Promise<void> {
	if (global.__prechopBootstrapped) return;
	global.__prechopBootstrapped = true;

	assertSecrets();

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
