"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import styled from "styled-components";
import { Avatar, Container, ThemeToggle } from "@/components";
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
	{ href: "/timetable", label: "Timetable", icon: "🗓️" },
	{ href: "/earnings", label: "Earnings", icon: "💰" },
	{ href: "/vendor/settings", label: "Settings", icon: "⚙️" },
];

const Bar = styled.header`
	position: sticky;
	top: 0;
	z-index: 50;
	background: color-mix(in srgb, var(--pc-surface) 82%, transparent);
	backdrop-filter: saturate(1.4) blur(12px);
	border-bottom: 1px solid var(--pc-border);
`;
const BarInner = styled(Container)`
	display: flex;
	align-items: center;
	justify-content: space-between;
	height: 62px;
`;
const Brand = styled(Link)`
	display: inline-flex;
	align-items: center;
	gap: 9px;
	font-family: var(--pc-font-display);
	font-weight: 800;
	font-size: 21px;
	letter-spacing: -0.03em;
	color: var(--pc-text);
`;
const Logo = styled.span`
	width: 30px;
	height: 30px;
	display: grid;
	place-items: center;
	border-radius: 9px;
	background: var(--pc-gradient-warm);
	box-shadow: var(--pc-shadow-primary);
	font-size: 16px;
`;
const Right = styled.div`
	display: flex;
	align-items: center;
	gap: 14px;
	/* Keep the right cluster a constant width pinned to the edge so its
	   contents (incl. the mode switcher) never shift when the middle nav
	   changes width between Selling (6 items) and Buying (3 items) pages. */
	flex-shrink: 0;
`;
const ModeSwitch = styled.div`
	display: inline-flex;
	align-items: center;
	gap: 2px;
	padding: 3px;
	background: var(--pc-surface-2);
	border: 1px solid var(--pc-border);
	border-radius: var(--pc-radius-pill);
	flex-shrink: 0;
`;
const ModeBtn = styled.button<{ $active: boolean }>`
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 5px;
	white-space: nowrap;
	border: none;
	cursor: pointer;
	font-size: 13px;
	font-weight: 700;
	padding: 6px 11px;
	border-radius: var(--pc-radius-pill);
	color: ${(p) => (p.$active ? "var(--pc-color-primary)" : "var(--pc-text-muted)")};
	background: ${(p) => (p.$active ? "var(--pc-surface)" : "transparent")};
	box-shadow: ${(p) => (p.$active ? "var(--pc-shadow-sm)" : "none")};
	transition: background var(--pc-dur) var(--pc-ease), color var(--pc-dur) var(--pc-ease);
	&:hover { color: var(--pc-text); }
`;
const NavRow = styled.nav`
	display: none;
	@media (min-width: 760px) {
		display: flex;
		align-items: center;
		gap: 2px;
		/* Absorb width changes here (6 selling items vs 3 buying items) and never
		   push the right-hand cluster past the content edge, so the mode switcher
		   keeps a fixed position across pages. */
		min-width: 0;
	}
`;
const TopLink = styled(Link)<{ $active: boolean }>`
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 8px 11px;
	border-radius: var(--pc-radius-pill);
	font-size: 14px;
	font-weight: 700;
	color: ${(p) => (p.$active ? "var(--pc-color-primary)" : "var(--pc-text-muted)")};
	background: ${(p) => (p.$active ? "var(--pc-color-primary-50)" : "transparent")};
	transition: background var(--pc-dur) var(--pc-ease), color var(--pc-dur) var(--pc-ease);
	&:hover { color: var(--pc-text); background: var(--pc-surface-2); }
`;
const LogoutBtn = styled.button`
	background: none;
	border: none;
	color: var(--pc-text-muted);
	font-size: 14px;
	cursor: pointer;
	font-weight: 700;
	padding: 6px 4px;
	/* Never wrap to two lines — a changing label height/width would shift the
	   rest of the right cluster. */
	white-space: nowrap;
	&:hover { color: var(--pc-color-danger); }
`;
const Main = styled.main`
	/* Fill the viewport minus the top bar and (mobile-only) bottom nav. */
	min-height: calc(100dvh - 62px - 70px);
	padding: var(--pc-space-6) 0 var(--pc-space-10);
	@media (min-width: 760px) {
		min-height: calc(100dvh - 62px);
		padding-bottom: var(--pc-space-8);
	}
`;
const BottomNav = styled.nav`
	position: sticky;
	bottom: 0;
	z-index: 50;
	background: color-mix(in srgb, var(--pc-surface) 88%, transparent);
	backdrop-filter: saturate(1.4) blur(12px);
	border-top: 1px solid var(--pc-border);
	display: flex;
	justify-content: space-around;
	padding: 8px 0 max(8px, env(safe-area-inset-bottom));
	@media (min-width: 760px) {
		display: none;
	}
`;
const NavLink = styled(Link)<{ $active: boolean }>`
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 3px;
	font-size: 11px;
	font-weight: 700;
	color: ${(p) => (p.$active ? "var(--pc-color-primary)" : "var(--pc-text-muted)")};
	transition: color var(--pc-dur) var(--pc-ease);
	span:first-child {
		font-size: 21px;
		transform: ${(p) => (p.$active ? "translateY(-1px) scale(1.05)" : "none")};
		transition: transform var(--pc-dur) var(--pc-ease);
	}
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

	if (isLoading || !isAuthenticated) return <PageLoader full />;

	const isVendor =
		shellRole === "VENDOR" ||
		(shellRole === undefined && !!user?.groups?.includes("Vendors"));
	const nav = isVendor ? vendorNav : buyerNav;
	// Vendors can also shop as buyers (from other kitchens). The mode switcher
	// lets them cross between their selling area and the buyer marketplace; it is
	// hidden from plain buyers. Its state is derived from the current area, so it
	// can never desync from the route.
	const canSell = !!user?.groups?.includes("Vendors");
	const fullName = user
		? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
		: undefined;

	return (
		<>
			<Bar>
				<BarInner>
					<Brand
						href={nav === vendorNav ? "/dashboard" : "/marketplace"}
					>
						<Logo aria-hidden>🍲</Logo>
						Prechop
					</Brand>
					<NavRow>
						{nav.map((n) => (
							<TopLink
								key={n.href}
								href={n.href}
								$active={pathname.startsWith(n.href)}
							>
								<span aria-hidden>{n.icon}</span>
								{n.label}
							</TopLink>
						))}
					</NavRow>
					<Right>
						{canSell && (
							<ModeSwitch
								role="tablist"
								aria-label="Selling or buying mode"
							>
								<ModeBtn
									type="button"
									role="tab"
									aria-selected={isVendor}
									$active={isVendor}
									onClick={() => router.push("/dashboard")}
								>
									🧑‍🍳 Selling
								</ModeBtn>
								<ModeBtn
									type="button"
									role="tab"
									aria-selected={!isVendor}
									$active={!isVendor}
									onClick={() => router.push("/marketplace")}
								>
									🛒 Buying
								</ModeBtn>
							</ModeSwitch>
						)}
						<ThemeToggle />
						<Avatar name={fullName} size={34} />
						<LogoutBtn onClick={() => logout()}>Log out</LogoutBtn>
					</Right>
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
						<span aria-hidden>{n.icon}</span>
						<span>{n.label}</span>
					</NavLink>
				))}
			</BottomNav>
		</>
	);
}
