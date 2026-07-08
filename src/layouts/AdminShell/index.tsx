"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import styled from "styled-components";
import { Avatar, PageLoader } from "@/components";
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
	grid-template-columns: 256px 1fr;
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
		width: 268px;
		transform: translateX(${(p) => (p.$open ? "0" : "-100%")});
		transition: transform var(--pc-dur) var(--pc-ease);
		box-shadow: ${(p) => (p.$open ? "var(--pc-shadow-lg)" : "none")};
	}
`;
const Backdrop = styled.div<{ $open: boolean }>`
	display: none;
	@media (max-width: 860px) {
		display: ${(p) => (p.$open ? "block" : "none")};
		position: fixed;
		inset: 0;
		background: rgba(20, 16, 12, 0.5);
		backdrop-filter: blur(2px);
		z-index: 55;
	}
`;
const Brand = styled(Link)`
	font-family: var(--pc-font-display);
	font-weight: 800;
	font-size: 20px;
	letter-spacing: -0.03em;
	color: var(--pc-text);
	padding: var(--pc-space-5) var(--pc-space-5) var(--pc-space-4);
	display: flex;
	align-items: center;
	gap: 10px;
`;
const Logo = styled.span`
	width: 32px;
	height: 32px;
	display: grid;
	place-items: center;
	border-radius: 10px;
	background: var(--pc-gradient-warm);
	box-shadow: var(--pc-shadow-primary);
	font-size: 17px;
`;
const NavLabel = styled.span`
	padding: 0 var(--pc-space-5) 8px;
	font-size: 11px;
	font-weight: 800;
	letter-spacing: 0.09em;
	text-transform: uppercase;
	color: var(--pc-text-faint);
`;
const NavList = styled.nav`
	display: flex;
	flex-direction: column;
	gap: 3px;
	padding: 0 var(--pc-space-3);
	flex: 1;
	overflow-y: auto;
`;
const NavItem = styled(Link)<{ $active: boolean }>`
	display: flex;
	align-items: center;
	gap: 11px;
	padding: 11px 13px;
	border-radius: var(--pc-radius-sm);
	font-size: 14px;
	font-weight: 700;
	position: relative;
	color: ${(p) => (p.$active ? "var(--pc-color-primary)" : "var(--pc-text-muted)")};
	background: ${(p) => (p.$active ? "var(--pc-color-primary-50)" : "transparent")};
	transition: background var(--pc-dur) var(--pc-ease), color var(--pc-dur) var(--pc-ease);
	&:hover {
		background: ${(p) => (p.$active ? "var(--pc-color-primary-50)" : "var(--pc-surface-2)")};
		color: ${(p) => (p.$active ? "var(--pc-color-primary)" : "var(--pc-text)")};
	}
	&::before {
		content: "";
		position: absolute;
		left: 0;
		top: 50%;
		transform: translateY(-50%);
		height: ${(p) => (p.$active ? "18px" : "0")};
		width: 3px;
		border-radius: 0 3px 3px 0;
		background: var(--pc-color-primary);
		transition: height var(--pc-dur) var(--pc-ease);
	}
	span:first-child {
		font-size: 17px;
	}
`;
const SideFooter = styled.div`
	padding: var(--pc-space-4);
	border-top: 1px solid var(--pc-border);
	display: flex;
	flex-direction: column;
	gap: 12px;
`;
const UserRow = styled.div`
	display: flex;
	align-items: center;
	gap: 10px;
	min-width: 0;
`;
const UserMeta = styled.div`
	min-width: 0;
	display: flex;
	flex-direction: column;
`;
const UserName = styled.span`
	font-size: 13.5px;
	font-weight: 700;
	color: var(--pc-text);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
`;
const UserRole = styled.span`
	font-size: 11.5px;
	color: var(--pc-text-faint);
	font-weight: 600;
`;
const LogoutBtn = styled.button`
	width: 100%;
	background: var(--pc-surface-2);
	border: 1px solid var(--pc-border);
	border-radius: var(--pc-radius-sm);
	color: var(--pc-text);
	font-size: 14px;
	font-weight: 700;
	padding: 10px 12px;
	cursor: pointer;
	transition: background var(--pc-dur) var(--pc-ease);
	&:hover {
		background: var(--pc-color-danger-50);
		color: var(--pc-color-danger);
	}
`;
const Main = styled.main`
	min-width: 0;
	padding: var(--pc-space-6) var(--pc-space-6) var(--pc-space-10);
	background:
		radial-gradient(700px 320px at 100% -5%, var(--pc-color-primary-50), transparent 70%);
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
		height: 58px;
		padding: 0 var(--pc-space-4);
		border-bottom: 1px solid var(--pc-border);
		background: var(--pc-surface);
		position: sticky;
		top: 0;
		z-index: 50;
	}
`;
const Burger = styled.button`
	background: var(--pc-surface-2);
	border: 1px solid var(--pc-border);
	border-radius: 10px;
	width: 38px;
	height: 38px;
	display: grid;
	place-items: center;
	font-size: 18px;
	cursor: pointer;
	color: var(--pc-text);
	line-height: 1;
`;
const MobileBrand = styled.span`
	font-family: var(--pc-font-display);
	font-weight: 800;
	font-size: 18px;
	letter-spacing: -0.02em;
	color: var(--pc-text);
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
				<Brand href="/admin">
					<Logo aria-hidden>🍲</Logo>
					Prechop
				</Brand>
				<NavLabel>Management</NavLabel>
				<NavList>
					{nav.map((n) => (
						<NavItem
							key={n.href}
							href={n.href}
							$active={isActive(n.href)}
						>
							<span aria-hidden>{n.icon}</span>
							<span>{n.label}</span>
						</NavItem>
					))}
				</NavList>
				<SideFooter>
					<UserRow>
						<Avatar
							name={`${user.firstName} ${user.lastName}`}
							size={38}
						/>
						<UserMeta>
							<UserName>
								{user.firstName} {user.lastName}
							</UserName>
							<UserRole>Super Admin</UserRole>
						</UserMeta>
					</UserRow>
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
