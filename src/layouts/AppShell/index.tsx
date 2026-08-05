"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import styled from "styled-components";
import useSWR from "swr";
import { Avatar, Container, ThemeToggle } from "@/components";
import { PageLoader } from "@/components/Loader";
import { fetcher } from "@/constants/fetcher";
import { useAuth } from "@/hooks/Auth/useAuth";
import {
  useSavedKitchens,
  useSavedListings,
} from "@/hooks/useSavedCollections";

const buyerNav = [
  { href: "/marketplace", label: "Browse", icon: "🍲" },
  { href: "/my-orders", label: "Orders", icon: "🧾" },
  { href: "/notifications", label: "Alerts", icon: "🔔" },
  { href: "/account", label: "Account", icon: "👤" },
];
const buyerNavWithSaved = [
  ...buyerNav.slice(0, 2),
  { href: "/marketplace?saved=1", label: "Saved", icon: "♡" },
  ...buyerNav.slice(2),
];
const vendorMobileNav = [
  { href: "/dashboard", label: "Home", icon: "🏠" },
  { href: "/pipeline", label: "Orders", icon: "🔥" },
  { href: "/menu", label: "Menu", icon: "📋" },
  { href: "/earnings", label: "Earnings", icon: "💰" },
  { href: "/vendor/more", label: "More", icon: "⋯" },
];
const vendorDesktopNav = [
  { href: "/dashboard", label: "Home", icon: "🏠" },
  { href: "/pipeline", label: "Cooking", icon: "🔥" },
  { href: "/menu", label: "Menu", icon: "📋" },
  { href: "/timetable", label: "Timetable", icon: "🗓️" },
  { href: "/earnings", label: "Earnings", icon: "💰" },

  { href: "/notifications", label: "Notifications", icon: "🔔" },
  { href: "/vendor/settings", label: "Settings", icon: "⚙️" },
  { href: "/help?audience=vendor", label: "Support", icon: "💬" },
];
const vendorNav = vendorMobileNav;
const vendorSetupNav = [
  { href: "/dashboard", label: "Home", icon: "🏠" },
  { href: "/vendor/more", label: "More", icon: "⋯" },
  { href: "/vendor/onboarding", label: "Setup", icon: "✅" },
  { href: "/vendor/settings", label: "Settings", icon: "⚙️" },
];
const footerLinks = {
  buyer: [
    { href: "/help", label: "Help Center" },
    { href: "/policies/buyer-policy", label: "Buyer Policy" },
    { href: "/privacy", label: "Privacy" },
    { href: "/terms", label: "Terms" },
  ],
  vendor: [
    { href: "/help", label: "Help Center" },
    { href: "/policies/vendor-policy", label: "Vendor Policy" },
    { href: "/privacy", label: "Privacy" },
    { href: "/terms", label: "Terms" },
  ],
  public: [
    { href: "/help", label: "Help Center" },
    { href: "/policies/buyer-policy", label: "Buyer Policy" },
    { href: "/policies/vendor-policy", label: "Vendor Policy" },
    { href: "/privacy", label: "Privacy" },
    { href: "/terms", label: "Terms" },
  ],
} as const;

interface VendorMe {
  profileImageUrl?: string;
  status?:
    | "INCOMPLETE"
    | "PENDING_REVIEW"
    | "CHANGES_REQUESTED"
    | "ACTIVE"
    | "SUSPENDED";
}

const Bar = styled.header`
  position: sticky;
  top: 0;
  z-index: 50;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  background: color-mix(in srgb, var(--pc-surface) 82%, transparent);
  backdrop-filter: saturate(1.4) blur(12px);
  border-bottom: 1px solid var(--pc-border);
  overflow-x: clip;
`;
const BarInner = styled(Container)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  height: 64px;
  min-width: 0;
  max-width: min(var(--pc-maxw), 100%);
  @media (max-width: 420px) {
    gap: 6px;
  }
`;
const Brand = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: var(--pc-font-display);
  font-weight: 800;
  font-size: 20px;
  letter-spacing: -0.03em;
  color: var(--pc-text);
  min-width: max-content;
  flex: 0 0 auto;
  @media (max-width: 420px) {
    gap: 6px;
    font-size: 19px;
  }
`;
const Logo = styled.span`
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  box-shadow: var(--pc-shadow-primary);
  font-size: 15px;
  flex-shrink: 0;
  @media (max-width: 420px) {
    width: 26px;
    height: 26px;
    border-radius: 7px;
    font-size: 14px;
  }
`;
const Right = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 1;
  min-width: 0;
  @media (max-width: 759px) {
    gap: 6px;
  }
`;
const ModeSwitch = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  background: var(--pc-surface-2);
  border: 1px solid var(--pc-border);
  border-radius: var(--pc-radius-pill);
  flex-shrink: 1;
  min-width: 0;
`;
const ModeBtn = styled.button<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  white-space: nowrap;
  border: none;
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
  padding: 5px 10px;
  border-radius: var(--pc-radius-pill);
  color: ${(p) =>
    p.$active ? "var(--pc-color-primary)" : "var(--pc-text-muted)"};
  background: ${(p) => (p.$active ? "var(--pc-surface)" : "transparent")};
  box-shadow: ${(p) => (p.$active ? "var(--pc-shadow-sm)" : "none")};
  transition:
    background var(--pc-dur) var(--pc-ease),
    color var(--pc-dur) var(--pc-ease);
  &:hover {
    color: var(--pc-text);
  }
  @media (max-width: 420px) {
    gap: 3px;
    padding: 5px 8px;
    font-size: 12.5px;
  }
  @media (max-width: 360px) {
    padding: 5px 6px;
    font-size: 12px;
    .mode-icon {
      display: none;
    }
  }
`;
const ProfileAvatar = styled.div`
  display: inline-flex;
  flex-shrink: 0;
  @media (max-width: 759px) {
    display: none;
  }
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
  color: ${(p) =>
    p.$active ? "var(--pc-color-primary)" : "var(--pc-text-muted)"};
  background: ${(p) =>
    p.$active ? "var(--pc-color-primary-50)" : "transparent"};
  transition:
    background var(--pc-dur) var(--pc-ease),
    color var(--pc-dur) var(--pc-ease);
  &:hover {
    color: var(--pc-text);
    background: var(--pc-surface-2);
  }
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
  &:hover {
    color: var(--pc-color-danger);
  }
  @media (max-width: 759px) {
    display: none;
  }
`;
const GuestAction = styled(Link)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  border-radius: var(--pc-radius-pill);
  background: var(--pc-color-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 800;
  padding: 8px 13px;
  box-shadow: var(--pc-shadow-sm);
  @media (max-width: 420px) {
    padding: 7px 10px;
    font-size: 12px;
  }
`;
const Main = styled.main`
  /* Fill the viewport minus the top bar and (mobile-only) bottom nav. */
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  overflow-x: clip;
  min-height: calc(100dvh - 64px - 70px);
  padding: var(--pc-space-6) 0 var(--pc-space-10);
  @media (min-width: 760px) {
    min-height: calc(100dvh - 64px);
    padding-left: 220px;
    padding-bottom: var(--pc-space-8);
  }
`;
const MainInner = styled(Container)`
  min-height: inherit;
  display: flex;
  flex-direction: column;
`;
const VendorFooter = styled.footer`
  margin-top: auto;
  padding-top: var(--pc-space-3);
  border-top: 1px solid var(--pc-border);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--pc-text-muted);
  font-size: 12px;
`;
const FooterLink = styled(Link)`
  color: var(--pc-text-muted);
  font-size: 12px;
  font-weight: 800;

  &:hover {
    color: var(--pc-color-primary);
  }
`;
const FooterLinks = styled.nav`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
`;
const FooterDot = styled.span`
  color: var(--pc-text-subtle);
`;
const BottomNav = styled.nav`
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 50;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  background: color-mix(in srgb, var(--pc-surface) 88%, transparent);
  backdrop-filter: saturate(1.4) blur(12px);
  border-top: 1px solid var(--pc-border);
  display: flex;
  justify-content: space-around;
  padding: 8px 0 max(8px, env(safe-area-inset-bottom));
  overflow-x: clip;
  @media (min-width: 760px) {
    display: none;
  }
`;
const NavLink = styled(Link)<{ $active: boolean }>`
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  font-weight: 700;
  color: ${(p) =>
    p.$active ? "var(--pc-color-primary)" : "var(--pc-text-muted)"};
  transition: color var(--pc-dur) var(--pc-ease);
  span:first-child {
    font-size: 21px;
    transform: ${(p) => (p.$active ? "translateY(-1px) scale(1.05)" : "none")};
    transition: transform var(--pc-dur) var(--pc-ease);
  }
`;
const NavIcon = styled.span`
  position: relative;
  display: inline-flex;
`;
const CountBubble = styled.span`
  position: absolute;
  top: -6px;
  right: -10px;
  min-width: 17px;
  height: 17px;
  padding: 0 5px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--pc-color-primary);
  color: #fff;
  font-size: 10px;
  font-weight: 900;
  line-height: 1;
  box-shadow: 0 0 0 2px var(--pc-surface);

  @media (max-width: 420px) {
    top: -5px;
    right: -8px;
    min-width: 10px;
    height: 10px;
    padding: 0 4px;
    font-size: 5px;
    font-weight: 500;
  }

  @media (max-width: 360px) {
    top: -4px;
    right: -6px;
    min-width: 13px;
    height: 13px;
    padding: 0 3px;
    font-size: 8px;
  }
`;

const Sidebar = styled.nav`
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: 220px;
  z-index: 40;
  background: var(--pc-surface);
  border-right: 1px solid var(--pc-border);
  padding: 16px 10px;
  overflow-y: auto;
  @media (min-width: 760px) {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
`;
const SidebarBrand = styled(Brand)`
  padding: 4px 10px 14px;
  border-bottom: 1px solid var(--pc-border);
  margin-bottom: 6px;
`;
const SidebarLink = styled(Link)<{ $active: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--pc-radius);
  font-size: 14px;
  font-weight: 700;
  color: ${(p) =>
    p.$active ? "var(--pc-color-primary)" : "var(--pc-text-muted)"};
  background: ${(p) =>
    p.$active ? "var(--pc-color-primary-50)" : "transparent"};
  transition:
    background var(--pc-dur) var(--pc-ease),
    color var(--pc-dur) var(--pc-ease);
  &:hover {
    color: var(--pc-text);
    background: var(--pc-surface-2);
  }
  text-decoration: none;
`;
const SidebarFooter = styled.div`
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px solid var(--pc-border);
`;
const SidebarCount = styled.span`
  margin-left: auto;
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--pc-color-primary);
  color: #fff;
  font-size: 10px;
  font-weight: 900;
  line-height: 18px;
  text-align: center;
`;

function compactCount(count: number) {
  return count >= 10 ? "9+" : String(count);
}

export default function AppShell({
  children,
  shellRole,
  publicAccess = false,
}: {
  children: React.ReactNode;
  shellRole?: "BUYER" | "VENDOR";
  publicAccess?: boolean;
}) {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const savedKitchens = useSavedKitchens();
  const savedListings = useSavedListings();
  const router = useRouter();
  const pathname = usePathname();
  const [isSavedQuery, setIsSavedQuery] = useState(false);
  const isVendorOnboarding = pathname === "/vendor/onboarding";
  const isVendor =
    shellRole === "VENDOR" ||
    (shellRole === undefined && !!user?.groups?.includes("Vendors"));
  const { data: vendor } = useSWR<VendorMe>(
    isAuthenticated && isVendor && !isVendorOnboarding ? "/vendors/me" : null,
    fetcher,
    { shouldRetryOnError: false },
  );
  const { data: alertData } = useSWR<{ unread?: number }>(
    isAuthenticated ? "/notifications?limit=50" : null,
    fetcher,
    { refreshInterval: 15_000, shouldRetryOnError: false },
  );
  const alertCount = alertData?.unread ?? 0;

  useEffect(() => {
    if (!publicAccess && !isLoading && !isAuthenticated) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [publicAccess, isLoading, isAuthenticated, router, pathname]);

  useEffect(() => {
    const syncSavedQuery = () => {
      setIsSavedQuery(
        new URLSearchParams(window.location.search).get("saved") === "1",
      );
    };
    syncSavedQuery();
    window.addEventListener("popstate", syncSavedQuery);
    return () => window.removeEventListener("popstate", syncSavedQuery);
  }, []);

  if (isLoading) return <PageLoader full />;
  if (!publicAccess && !isAuthenticated) return <PageLoader full />;

  const isActiveVendor = vendor?.status === "ACTIVE";
  const nav = isVendor
    ? isActiveVendor
      ? vendorDesktopNav
      : vendorSetupNav
    : buyerNavWithSaved;
  const mobileNav = isVendor
    ? isActiveVendor
      ? vendorMobileNav
      : vendorSetupNav
    : buyerNav;
  // Vendors can also shop as buyers (from other kitchens). The mode switcher
  // lets them cross between their selling area and the buyer marketplace; it is
  // hidden from plain buyers. Its state is derived from the current area, so it
  // can never desync from the route.
  const canSell = !!user?.groups?.includes("Vendors") || isVendor || !!vendor;
  const fullName = user
    ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
    : undefined;
  const footerAudience = !isAuthenticated
    ? "public"
    : isVendor
      ? "vendor"
      : "buyer";
  const savedView = pathname === "/marketplace" && isSavedQuery;
  const savedCount = savedKitchens.count + savedListings.count;
  const isNavActive = (href: string, label: string) => {
    if (label === "Saved") return savedView;
    if (label === "More") return pathname === "/vendor/more";
    if (label === "Notifications") return pathname === "/notifications";
    if (label === "Support") return pathname === "/help";
    if (href === "/marketplace") return pathname === href && !savedView;
    return pathname.startsWith(href);
  };

  return (
    <>
      <Bar>
        <BarInner>
          <Brand href={isVendor ? "/dashboard" : "/marketplace"}>
            {/* <Logo aria-hidden>🍲</Logo> */}
            <Logo aria-hidden>
              <Image src="/dark.png" alt="Prechop" width={30} height={30} />
            </Logo>
            Prechop
          </Brand>
          <Right>
            {isAuthenticated && canSell && (
              <ModeSwitch role="tablist" aria-label="Selling or buying mode">
                <ModeBtn
                  type="button"
                  role="tab"
                  aria-selected={isVendor}
                  $active={isVendor}
                  onClick={() => router.push("/dashboard")}>
                  🧑‍🍳 Selling
                </ModeBtn>
                <ModeBtn
                  type="button"
                  role="tab"
                  aria-selected={!isVendor}
                  $active={!isVendor}
                  onClick={() => router.push("/marketplace")}>
                  🛒 Buying
                </ModeBtn>
              </ModeSwitch>
            )}
            <ThemeToggle />
            {isAuthenticated ? (
              <ProfileAvatar>
                <Avatar
                  name={fullName}
                  src={isVendor ? vendor?.profileImageUrl : undefined}
                  size={34}
                />
              </ProfileAvatar>
            ) : (
              <GuestAction href={`/login?next=${encodeURIComponent(pathname)}`}>
                Log in
              </GuestAction>
            )}
          </Right>
        </BarInner>
      </Bar>
      <Sidebar>
        <SidebarBrand href={isVendor ? "/dashboard" : "/marketplace"}>
          <Logo aria-hidden>
            <Image src="/dark.png" alt="Prechop" width={30} height={30} />
          </Logo>
          Prechop
        </SidebarBrand>
        {(isAuthenticated ? nav : [buyerNav[0]]).map((n) => (
          <SidebarLink
            key={n.href}
            href={n.href}
            $active={isNavActive(n.href, n.label)}
            onClick={() => {
              if (n.href.startsWith("/marketplace")) {
                setIsSavedQuery(n.label === "Saved");
              }
            }}>
            <NavIcon aria-hidden>{n.icon}</NavIcon>
            {n.label}
            {n.label === "Saved" && savedCount > 0 && (
              <SidebarCount>{compactCount(savedCount)}</SidebarCount>
            )}
            {(n.label === "Alerts" ||
              n.label === "More" ||
              n.label === "Notifications") &&
              alertCount > 0 && (
                <SidebarCount>{compactCount(alertCount)}</SidebarCount>
              )}
          </SidebarLink>
        ))}
        {isAuthenticated && (
          <SidebarFooter>
            <LogoutBtn onClick={() => logout()}>Log out</LogoutBtn>
          </SidebarFooter>
        )}
      </Sidebar>
      <Main>
        <MainInner>
          {children}
          <VendorFooter>
            <FooterLinks aria-label="Footer links">
              {footerLinks[footerAudience].map((link, index, links) => (
                <Fragment key={link.href}>
                  <FooterLink href={link.href}>{link.label}</FooterLink>
                  {index < links.length - 1 && (
                    <FooterDot aria-hidden>·</FooterDot>
                  )}
                </Fragment>
              ))}
            </FooterLinks>
            <span>© 2026 Prechop</span>
          </VendorFooter>
        </MainInner>
      </Main>
      <BottomNav>
        {(isAuthenticated ? mobileNav : [buyerNav[0]]).map((n) => (
          <NavLink
            key={n.href}
            href={n.href}
            $active={isNavActive(n.href, n.label)}
            onClick={() => {
              if (n.href.startsWith("/marketplace")) {
                setIsSavedQuery(n.label === "Saved");
              }
            }}>
            <NavIcon aria-hidden>
              {n.icon}
              {n.label === "Saved" && savedCount > 0 && (
                <CountBubble>{compactCount(savedCount)}</CountBubble>
              )}
              {(n.label === "Alerts" || n.label === "More") &&
                alertCount > 0 && (
                  <CountBubble>{compactCount(alertCount)}</CountBubble>
                )}
            </NavIcon>
            <span>{n.label}</span>
          </NavLink>
        ))}
      </BottomNav>
    </>
  );
}
