// import type { Metadata, Viewport } from "next";
// import { Bricolage_Grotesque, Plus_Jakarta_Sans } from "next/font/google";
// import {
// 	BodyWrapper,
// 	PwaRegistrar,
// 	StyledComponentsRegistry,
// } from "@/components";

// const jakarta = Plus_Jakarta_Sans({
// 	subsets: ["latin"],
// 	weight: ["400", "500", "600", "700", "800"],
// 	variable: "--pc-font-sans-loaded",
// 	display: "swap",
// });

// const bricolage = Bricolage_Grotesque({
// 	subsets: ["latin"],
// 	weight: ["500", "600", "700", "800"],
// 	variable: "--pc-font-display-loaded",
// 	display: "swap",
// });

// export const metadata: Metadata = {
// 	title: {
// 		default: "Prechop — Order before they cook",
// 		template: "%s · Prechop",
// 	},
// 	description:
// 		"Prechop is a campus food pre-order marketplace. Reserve and pay for your meal before the vendor starts cooking.",
// 	manifest: "/manifest.webmanifest",
// 	appleWebApp: { capable: true, title: "Prechop", statusBarStyle: "default" },
// };

// export const viewport: Viewport = {
// 	themeColor: "#FF5A1F",
// 	width: "device-width",
// 	initialScale: 1,
// };

// export default function RootLayout({
// 	children,
// }: Readonly<{ children: React.ReactNode }>) {
// 	return (
// 		<html
// 			lang="en"
// 			className={`${jakarta.variable} ${bricolage.variable}`}
// 			// The pre-paint script below sets `data-theme` from localStorage
// 			// before hydration, so <html> attributes intentionally differ from
// 			// the server render — suppress the expected mismatch warning.
// 			suppressHydrationWarning
// 		>
// 			<head>
// 				<link rel="apple-touch-icon" href="/icons/icon-192.svg" />
// 				<style>{`html,body{background:#FFF6EC}:root[data-theme="dark"] body{background:#14100C}`}</style>
// 				{/* Apply the saved theme before first paint to avoid a flash. */}
// 				<script
// 					// biome-ignore lint/security/noDangerouslySetInnerHtml: tiny inline theme bootstrap must run pre-hydration
// 					dangerouslySetInnerHTML={{
// 						__html: `(function(){try{var t=localStorage.getItem('pc-theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`,
// 					}}
// 				/>
// 			</head>
// 			<body className={jakarta.className}>
// 				<div id="modal-root" />
// 				<StyledComponentsRegistry>
// 					<BodyWrapper>{children}</BodyWrapper>
// 				</StyledComponentsRegistry>
// 				<PwaRegistrar />
// 			</body>
// 		</html>
// 	);
// }

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
		default: "Prechop — Order Before They Cook",
		template: "%s · Prechop",
	},
	description:
		"Pre-order meals from student vendors and campus kitchens before they start cooking. No queues, no sold-out food. Available on Nigerian university campuses.",
	keywords: [
		"campus food Nigeria",
		"student food order",
		"university canteen Nigeria",
		"pre-order meals Nigeria",
		"ABU food order",
		"campus food delivery",
		"prechop",
	],
	manifest: "/manifest.webmanifest",
	appleWebApp: {
		capable: true,
		title: "Prechop",
		statusBarStyle: "default",
	},
	metadataBase: new URL("https://prechop.com.ng"),
	alternates: {
		canonical: "/",
	},
	openGraph: {
		title: "Prechop — Order Before They Cook",
		description:
			"Pre-order meals from student vendors and campus kitchens before they start cooking. No queues, no sold-out food.",
		url: "https://prechop.com.ng",
		siteName: "Prechop",
		images: [
			{
				url: "/og-image.png", // create a 1200x630px image and put in /public
				width: 1200,
				height: 630,
				alt: "Prechop — Campus food pre-order marketplace",
			},
		],
		locale: "en_NG",
		type: "website",
	},
	twitter: {
		card: "summary_large_image",
		title: "Prechop — Order Before They Cook",
		description:
			"Pre-order meals from student vendors and campus kitchens before they start cooking.",
		images: ["/og-image.png"],
	},
	robots: {
		index: true,
		follow: true,
		googleBot: {
			index: true,
			follow: true,
			"max-image-preview": "large",
		},
	},
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
		<html
			lang="en"
			className={`${jakarta.variable} ${bricolage.variable}`}
			suppressHydrationWarning
		>
			<head>
				<link rel="apple-touch-icon" href="/icons/icon-192.svg" />
				<style>{`html,body{background:#FFF6EC}:root[data-theme="dark"] body{background:#14100C}`}</style>
				<script
					dangerouslySetInnerHTML={{
						__html: `(function(){try{var t=localStorage.getItem('pc-theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`,
					}}
				/>
				{/* Structured data for Google */}
				<script
					type="application/ld+json"
					dangerouslySetInnerHTML={{
						__html: JSON.stringify({
							"@context": "https://schema.org",
							"@type": "WebApplication",
							name: "Prechop",
							url: "https://prechop.com.ng",
							description:
								"Campus food pre-order marketplace for Nigerian universities",
							applicationCategory: "FoodOrderingApplication",
							operatingSystem: "Web, Android, iOS",
							offers: {
								"@type": "Offer",
								price: "0",
								priceCurrency: "NGN",
							},
							areaServed: {
								"@type": "Country",
								name: "Nigeria",
							},
						}),
					}}
				/>
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


//////////////////////////////////////////////////
// Structured Data (JSON-LD)
// This helps Google understand what your app is and can show rich results:
//////////////////////////////////////////////////////////
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{
    __html: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebApplication",
      "name": "PreChop",
      "url": "https://prechop.com.ng",
      "description": "Campus food pre-order marketplace for Nigerian universities",
      "applicationCategory": "FoodOrderingApplication",
      "operatingSystem": "Web",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "NGN"
      },
      "areaServed": {
        "@type": "Country",
        "name": "Nigeria"
      }
    })
  }}
/>
