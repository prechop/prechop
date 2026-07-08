import client, { collectDefaultMetrics } from "prom-client";

declare global {
	// eslint-disable-next-line no-var
	var __prechopMetricsInit: boolean | undefined;
	// eslint-disable-next-line no-var
	var __prechopRestHistogram: client.Histogram<string> | undefined;
	// eslint-disable-next-line no-var
	var __prechopDbHistogram: client.Histogram<string> | undefined;
}

if (!global.__prechopMetricsInit) {
	collectDefaultMetrics();
	global.__prechopMetricsInit = true;
}

export const restResponseTimeHistogram: client.Histogram<string> =
	global.__prechopRestHistogram ??
	new client.Histogram({
		name: "http_request_duration_seconds",
		help: "Duration of HTTP requests in seconds",
		// `ip` is intentionally excluded: high-cardinality and client-spoofable.
		labelNames: ["method", "route", "status_code"],
	});

if (!global.__prechopRestHistogram) {
	global.__prechopRestHistogram = restResponseTimeHistogram;
}

export const databaseResponseTimeHistogram: client.Histogram<string> =
	global.__prechopDbHistogram ??
	new client.Histogram({
		name: "database_request_duration_seconds",
		help: "Duration of database requests in seconds",
		labelNames: ["operation", "collection", "method", "success"],
	});

if (!global.__prechopDbHistogram) {
	global.__prechopDbHistogram = databaseResponseTimeHistogram;
}

export async function renderMetrics(): Promise<{
	contentType: string;
	body: string;
}> {
	return {
		contentType: client.register.contentType,
		body: await client.register.metrics(),
	};
}
