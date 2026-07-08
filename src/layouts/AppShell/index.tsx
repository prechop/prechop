"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import styled from "styled-components";
import { Container } from "@/components";
import { PageLoader } from "@/components/Loader";
import { useAuth } from "@/hooks/Auth/useAuth";

const buyerNav = [
	{ href: "/marketplace", label: "Browse", icon: "🍲" },
	{ href: "/my-orders", label: "Orders", icon: "🧾" },
	{ href: "/account", label: "Account", icon: "👤" },
];
const vendorNav = [
	{ href: "/dashboard", label: "Home", icon: "🏠" },
	{ href: "/menu", label: "Menu", icon: "📋" },
	{ href: "/pipeline", label: "Cooking", icon: "🔥" },
	{ href: "/earnings", label: "Earnings", icon: "💰" },
];

const Bar = styled.header`
	position: sticky;
	top: 0;
	z-index: 50;
	background: var(--pc-surface);
	border-bottom: 1px solid var(--pc-border);
`;
const BarInner = styled(Container)`
	display: flex;
	align-items: center;
	justify-content: space-between;
	height: 58px;
`;
const Brand = styled(Link)`
	font-weight: 800;
	font-size: 20px;
	color: var(--pc-color-primary);
	letter-spacing: -0.02em;
`;
const LogoutBtn = styled.button`
	background: none;
	border: none;
	color: var(--pc-text-muted);
	font-size: 14px;
	cursor: pointer;
	font-weight: 600;
`;
const Main = styled.main`
	min-height: calc(100dvh - 58px - 64px);
	padding: var(--pc-space-5) 0 var(--pc-space-8);
`;
const BottomNav = styled.nav`
	position: sticky;
	bottom: 0;
	background: var(--pc-surface);
	border-top: 1px solid var(--pc-border);
	display: flex;
	justify-content: space-around;
	padding: 8px 0 max(8px, env(safe-area-inset-bottom));
`;
const NavLink = styled(Link)<{ $active: boolean }>`
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 2px;
	font-size: 11px;
	font-weight: 600;
	color: ${(p) => (p.$active ? "var(--pc-color-primary)" : "var(--pc-text-muted)")};
	span:first-child { font-size: 20px; }
`;

export default function AppShell({
	children,
	shellRole,
}: {
	children: React.ReactNode;
	shellRole?: "BUYER" | "VENDOR";
}) {
	const { user, isLoading, isAuthenticated, logout } = useAuth();
	const router = useRouter();
	const pathname = usePathname();

	useEffect(() => {
		if (!isLoading && !isAuthenticated) {
			router.replace(`/login?next=${encodeURIComponent(pathname)}`);
		}
	}, [isLoading, isAuthenticated, router, pathname]);

	if (isLoading || !isAuthenticated) return <PageLoader />;

	const nav = (shellRole ?? user?.role) === "VENDOR" ? vendorNav : buyerNav;

	return (
		<>
			<Bar>
				<BarInner>
					<Brand href="/">Prechop</Brand>
					<LogoutBtn onClick={() => logout()}>Log out</LogoutBtn>
				</BarInner>
			</Bar>
			<Main>
				<Container>{children}</Container>
			</Main>
			<BottomNav>
				{nav.map((n) => (
					<NavLink
						key={n.href}
						href={n.href}
						$active={pathname.startsWith(n.href)}
					>
						<span>{n.icon}</span>
						<span>{n.label}</span>
					</NavLink>
				))}
			</BottomNav>
		</>
	);
}
