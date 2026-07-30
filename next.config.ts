import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	reactStrictMode: true,
	poweredByHeader: false,
	productionBrowserSourceMaps: false,
	compiler: {
		styledComponents: true,
	},
	// Heavy native / server-only deps must not be bundled into the
	// route-handler bundles. They are loaded from node_modules at runtime.
	serverExternalPackages: [
		"@aws-sdk/client-s3",
		"@aws-sdk/s3-request-presigner",
		"@react-pdf/renderer",
		"bcrypt",
		"cron",
		"ioredis",
		"mongoose",
		"prom-client",
		"resend",
		"sharp",
		"web-push",
	],
	async headers() {
		return [
			{
				source: "/",
				headers: [{ key: "cache-control", value: "no-cache" }],
			},
		];
	},
};

export default nextConfig;
