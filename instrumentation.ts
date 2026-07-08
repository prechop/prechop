/**
 * Next.js instrumentation hook — invoked once per server process on startup.
 * We use it to warm DB/Redis connections and to schedule the in-process cron
 * jobs that previously lived alongside the standalone Fastify server (and the
 * BullMQ worker process, which is removed in the merged app).
 *
 * Only runs in the Node.js runtime; skipped for Edge.
 */
export async function register() {
	if (process.env.NEXT_RUNTIME !== "nodejs") return;
	const { bootstrap } = await import("./src/server/runtime/bootstrap");
	await bootstrap();
}
