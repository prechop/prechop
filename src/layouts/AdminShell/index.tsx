"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import styled from "styled-components";
import { PageLoader } from "@/components";
import { useAuth } from "@/hooks/Auth/useAuth";

const nav = [
	{ href: "/admin", label: "Overview", icon: "📊" },
	{ href: "/admin/vendors", label: "Vendors", icon: "🍳" },
	{ href: "/admin/orders", label: "Orders", icon: "🧾" },
	{ href: "/admin/reviews", label: "Reviews", icon: "⭐" },
	{ href: "/admin/campuses", label: "Campuses", icon: "🏫" },
	{ href: "/admin/schools", label: "Schools", icon: "🎓" },
	{ href: "/admin/whatsapp-tvs", label: "WhatsApp TVs", icon: "📺" },
	{ href: "/admin/settings", label: "Settings", icon: "⚙️" },
];

const Layout = styled.div`
	display: grid;
	grid-template-columns: 240px 1fr;
	min-height: 100dvh;
	@media (max-width: 860px) {
		grid-template-columns: 1fr;
	}
`;
const Sidebar = styled.aside<{ $open: boolean }>`
	background: var(--pc-surface);
	border-right: 1px solid var(--pc-border);
	display: flex;
	flex-direction: column;
	position: sticky;
	top: 0;
	height: 100dvh;
	@media (max-width: 860px) {
		position: fixed;
		z-index: 60;
		width: 260px;
		transform: translateX(${(p) => (p.$open ? "0" : "-100%")});
		transition: transform 0.2s ease;
		box-shadow: ${(p) => (p.$open ? "var(--pc-shadow-lg)" : "none")};
	}
`;
const Backdrop = styled.div<{ $open: boolean }>`
	display: none;
	@media (max-width: 860px) {
		display: ${(p) => (p.$open ? "block" : "none")};
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		z-index: 55;
	}
`;
const Brand = styled(Link)`
	font-weight: 800;
	font-size: 20px;
	color: var(--pc-color-primary);
	letter-spacing: -0.02em;
	padding: var(--pc-space-5) var(--pc-space-4) var(--pc-space-4);
	display: flex;
	align-items: center;
	gap: 8px;
`;
const NavList = styled.nav`
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 0 var(--pc-space-3);
	flex: 1;
	overflow-y: auto;
`;
const NavItem = styled(Link)<{ $active: boolean }>`
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 10px 12px;
	border-radius: var(--pc-radius-sm);
	font-size: 14px;
	font-weight: 600;
	color: ${(p) => (p.$active ? "var(--pc-text-inverse)" : "var(--pc-text-muted)")};
	background: ${(p) => (p.$active ? "var(--pc-color-primary)" : "transparent")};
	&:hover {
		background: ${(p) =>
			p.$active ? "var(--pc-color-primary)" : "var(--pc-surface-2)"};
	}
	span:first-child {
		font-size: 17px;
	}
`;
const SideFooter = styled.div`
	padding: var(--pc-space-4);
	border-top: 1px solid var(--pc-border);
`;
const UserLine = styled.div`
	font-size: 13px;
	color: var(--pc-text-muted);
	margin-bottom: 8px;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
`;
const LogoutBtn = styled.button`
	width: 100%;
	background: var(--pc-surface-2);
	border: 1px solid var(--pc-border);
	border-radius: var(--pc-radius-sm);
	color: var(--pc-text);
	font-size: 14px;
	font-weight: 600;
	padding: 9px 12px;
	cursor: pointer;
	&:hover {
		background: var(--pc-border);
	}
`;
const Main = styled.main`
	min-width: 0;
	padding: var(--pc-space-6) var(--pc-space-5) var(--pc-space-8);
	@media (max-width: 860px) {
		padding: var(--pc-space-4);
	}
`;
const MobileBar = styled.div`
	display: none;
	@media (max-width: 860px) {
		display: flex;
		align-items: center;
		gap: 12px;
		height: 56px;
		padding: 0 var(--pc-space-4);
		border-bottom: 1px solid var(--pc-border);
		background: var(--pc-surface);
		position: sticky;
		top: 0;
		z-index: 50;
	}
`;
const Burger = styled.button`
	background: none;
	border: none;
	font-size: 22px;
	cursor: pointer;
	color: var(--pc-text);
	line-height: 1;
`;
const MobileBrand = styled.span`
	font-weight: 800;
	font-size: 18px;
	color: var(--pc-color-primary);
`;

export default function AdminShell({
	children,
}: {
	children: React.ReactNode;
}) {
	const { user, isLoading, isAuthenticated, logout } = useAuth();
	const router = useRouter();
	const pathname = usePathname();
	const [open, setOpen] = useState(false);

	useEffect(() => {
		if (isLoading) return;
		if (!isAuthenticated) {
			router.replace(`/login?next=${encodeURIComponent(pathname)}`);
		} else if (user && user.role !== "SUPER_ADMIN") {
			router.replace("/");
		}
	}, [isLoading, isAuthenticated, user, router, pathname]);

	// Close the mobile drawer on navigation.
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-run purely to react to route changes
	useEffect(() => {
		setOpen(false);
	}, [pathname]);

	if (isLoading || !isAuthenticated || user?.role !== "SUPER_ADMIN") {
		return <PageLoader />;
	}

	const isActive = (href: string) =>
		href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

	return (
		<Layout>
			<Backdrop $open={open} onClick={() => setOpen(false)} />
			<Sidebar $open={open}>
				<Brand href="/admin">🍲 Prechop Admin</Brand>
				<NavList>
					{nav.map((n) => (
						<NavItem
							key={n.href}
							href={n.href}
							$active={isActive(n.href)}
						>
							<span>{n.icon}</span>
							<span>{n.label}</span>
						</NavItem>
					))}
				</NavList>
				<SideFooter>
					<UserLine>
						{user.firstName} {user.lastName}
					</UserLine>
					<LogoutBtn onClick={() => logout()}>Log out</LogoutBtn>
				</SideFooter>
			</Sidebar>
			<div style={{ minWidth: 0 }}>
				<MobileBar>
					<Burger
						onClick={() => setOpen(true)}
						aria-label="Open menu"
					>
						☰
					</Burger>
					<MobileBrand>Prechop Admin</MobileBrand>
				</MobileBar>
				<Main>{children}</Main>
			</div>
		</Layout>
	);
}
