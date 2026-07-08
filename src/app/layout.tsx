import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Plus_Jakarta_Sans } from "next/font/google";
import {
	BodyWrapper,
	PwaRegistrar,
	StyledComponentsRegistry,
} from "@/components";

const jakarta = Plus_Jakarta_Sans({
	subsets: ["latin"],
	weight: ["400", "500", "600", "700", "800"],
	variable: "--pc-font-sans-loaded",
	display: "swap",
});

const bricolage = Bricolage_Grotesque({
	subsets: ["latin"],
	weight: ["500", "600", "700", "800"],
	variable: "--pc-font-display-loaded",
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
	themeColor: "#FF5A1F",
	width: "device-width",
	initialScale: 1,
};

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="en" className={`${jakarta.variable} ${bricolage.variable}`}>
			<head>
				<link rel="apple-touch-icon" href="/icons/icon-192.svg" />
				<style>{`html,body{background:#FFF6EC}:root[data-theme="dark"] body{background:#14100C}`}</style>
			</head>
			<body className={jakarta.className}>
				<div id="modal-root" />
				<StyledComponentsRegistry>
					<BodyWrapper>{children}</BodyWrapper>
				</StyledComponentsRegistry>
				<PwaRegistrar />
			</body>
		</html>
	);
}
