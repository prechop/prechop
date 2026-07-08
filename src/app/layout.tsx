import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import {
	BodyWrapper,
	PwaRegistrar,
	StyledComponentsRegistry,
} from "@/components";

const dmSans = DM_Sans({
	subsets: ["latin"],
	weight: ["400", "500", "600", "700", "800"],
	variable: "--pc-font-sans-loaded",
	display: "swap",
});

export const metadata: Metadata = {
	title: {
		default: "Prechop — Order before they cook",
		template: "%s · Prechop",
	},
	description:
		"Prechop is a campus food pre-order marketplace. Reserve and pay for your meal before the vendor starts cooking.",
	manifest: "/manifest.webmanifest",
	appleWebApp: { capable: true, title: "Prechop", statusBarStyle: "default" },
};

export const viewport: Viewport = {
	themeColor: "#E8590C",
	width: "device-width",
	initialScale: 1,
};

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="en" className={dmSans.variable}>
			<head>
				<link rel="apple-touch-icon" href="/icons/icon-192.svg" />
				<style>{`html,body{background:#FAF8F4}:root[data-theme="dark"] body{background:#16130F}`}</style>
			</head>
			<body className={dmSans.className}>
				<div id="modal-root" />
				<StyledComponentsRegistry>
					<BodyWrapper>{children}</BodyWrapper>
				</StyledComponentsRegistry>
				<PwaRegistrar />
			</body>
		</html>
	);
}
