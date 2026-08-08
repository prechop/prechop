"use client";

import Link from "next/link";
import { useMemo } from "react";
import styled from "styled-components";
import useSWR from "swr";
import {
	Badge,
	FadeIn,
	Row,
	SectionHeader,
	Stack,
	Text,
} from "@/components";
import { useAuth } from "@/hooks/Auth/useAuth";
import { fetcher } from "@/constants/fetcher";
import type { VendorMe } from "@/libs/VendorOnboardingWrapper";

const Page = styled.div`
  background: var(--pc-vendor-bg);
  min-height: 100%;
`;
const TopBar = styled.div`
  display: flex;
  align-items: center;
  gap: var(--pc-space-3);
  padding: var(--pc-space-4) var(--pc-space-5) 0;
`;
const BackLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--pc-radius-pill);
  background: var(--pc-vendor-surface);
  border: 1px solid var(--pc-vendor-border);
  color: var(--pc-text);
  font-size: 18px;
  transition: background var(--pc-dur) var(--pc-ease), border-color var(--pc-dur) var(--pc-ease);
  &:hover {
    border-color: var(--pc-color-primary);
    background: var(--pc-vendor-surface-2);
  }
`;
const PageTitle = styled.h1`
  font-family: var(--pc-font-display);
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--pc-text);
`;
const VendorCard = styled(Link)`
  display: flex;
  align-items: center;
  gap: var(--pc-space-4);
  background: var(--pc-vendor-surface);
  border: 1px solid var(--pc-vendor-border);
  border-radius: var(--pc-radius);
  margin-bottom: var(--pc-space-4);
  padding: var(--pc-space-4);
  color: inherit;
  text-decoration: none;
  transition: border-color var(--pc-dur) var(--pc-ease), background var(--pc-dur) var(--pc-ease);
  &:hover {
    border-color: var(--pc-color-primary);
    background: var(--pc-vendor-surface-2);
  }
`;
const VendorImage = styled.div`
  width: 52px;
  height: 52px;
  border-radius: var(--pc-radius-sm);
  background: var(--pc-gradient-warm);
  flex-shrink: 0;
  display: grid;
  place-items: center;
  font-size: 24px;
  box-shadow: var(--pc-shadow-primary);
  overflow: hidden;
`;
const VendorImageImg = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
`;
const VendorInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
`;
const VendorName = styled.span`
  font-family: var(--pc-font-display);
  font-size: 16px;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: var(--pc-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;
const VendorMeta = styled.div`
  display: flex;
  align-items: center;
  gap: var(--pc-space-2);
`;
const VendorStatusBadge = styled(Badge)`
  flex-shrink: 0;
`;
const VendorId = styled.span`
  font-size: 12px;
  color: var(--pc-text-muted);
  font-weight: 600;
`;
const VendorChevron = styled.span`
  font-size: 18px;
  color: var(--pc-text-muted);
  flex-shrink: 0;
`;
const SectionTitle = styled.h2`
  font-family: var(--pc-font-display);
  font-size: 13px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--pc-text-muted);
  margin-bottom: var(--pc-space-2);
`;
const MenuCard = styled.div`
  background: var(--pc-vendor-surface);
  border: 1px solid var(--pc-vendor-border);
  border-radius: var(--pc-radius);
  margin-bottom: var(--pc-space-3);
  overflow: hidden;
`;
const MenuRow = styled(Link)`
  display: flex;
  align-items: center;
  gap: var(--pc-space-3);
  padding: var(--pc-space-3) var(--pc-space-4);
  color: inherit;
  text-decoration: none;
  transition: background var(--pc-dur) var(--pc-ease);
  &:not(:last-child) {
    border-bottom: 1px solid var(--pc-vendor-border);
  }
  &:hover {
    background: var(--pc-vendor-surface-2);
  }
`;
const MenuIcon = styled.span`
  width: 36px;
  height: 36px;
  border-radius: var(--pc-radius-sm);
  background: var(--pc-vendor-surface-2);
  display: grid;
  place-items: center;
  font-size: 18px;
  flex-shrink: 0;
`;
const MenuText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
`;
const MenuTitle = styled.span`
  font-size: 14px;
  font-weight: 700;
  color: var(--pc-text);
`;
const MenuDesc = styled.span`
  font-size: 12px;
  font-weight: 600;
  color: var(--pc-text-muted);
`;
const MenuRight = styled.div`
  display: flex;
  align-items: center;
  gap: var(--pc-space-2);
  flex-shrink: 0;
`;
const MenuBadge = styled.span`
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--pc-color-primary);
  color: #fff;
  font-size: 10px;
  font-weight: 900;
`;
const MenuChevron = styled.span`
  font-size: 16px;
  color: var(--pc-text-muted);
`;
const LogoutBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--pc-space-2);
  width: 100%;
  padding: var(--pc-space-4);
  border-radius: var(--pc-radius);
  background: transparent;
  border: 1px solid var(--pc-vendor-border);
  color: var(--pc-color-danger);
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  transition: background var(--pc-dur) var(--pc-ease), border-color var(--pc-dur) var(--pc-ease);
  margin-top: var(--pc-space-4);
  &:hover {
    background: var(--pc-vendor-surface-2);
    border-color: var(--pc-color-danger);
  }
`;

export default function VendorMoreWrapper() {
	const { logout } = useAuth();
	const { data: vendor } = useSWR<VendorMe>("/vendors/me", fetcher);
	const { data: alertData } = useSWR<{ unread?: number }>(
		"/notifications?limit=50",
		fetcher,
		{ refreshInterval: 15_000, shouldRetryOnError: false },
	);
	const alertCount = alertData?.unread ?? 0;

	const openLabel = useMemo(() => {
		if (!vendor?.isOpenForOrders) return "Closed";
		return "Open";
	}, [vendor?.isOpenForOrders]);

	const shortId = useMemo(() => {
		if (!vendor?.id) return "";
		return vendor.id.slice(-6).toUpperCase();
	}, [vendor?.id]);

	return (
		<Page>
			<Stack $gap={14}>
				<TopBar>
					<BackLink href="/dashboard" aria-label="Back">
						‹
					</BackLink>
					<PageTitle>More</PageTitle>
				</TopBar>

				<VendorCard href="/vendor/settings">
					<VendorImage aria-hidden>
						{vendor?.profileImageUrl ? (
							<VendorImageImg
								src={vendor.profileImageUrl}
								alt=""
								loading="lazy"
							/>
						) : (
							"🍲"
						)}
					</VendorImage>
					<VendorInfo>
						<VendorName>
							{vendor?.businessName ?? "Your kitchen"}
						</VendorName>
						<VendorMeta>
							<VendorStatusBadge $tone={vendor?.isOpenForOrders ? "success" : "danger"}>
								{openLabel}
							</VendorStatusBadge>
							{shortId && <VendorId>ID: {shortId}</VendorId>}
						</VendorMeta>
					</VendorInfo>
					<VendorChevron aria-hidden>›</VendorChevron>
				</VendorCard>

				<SectionTitle>Grow your business</SectionTitle>
				<MenuCard>
					<MenuRow href="/timetable">
						<MenuIcon aria-hidden>🗓️</MenuIcon>
						<MenuText>
							<MenuTitle>My timetable</MenuTitle>
							<MenuDesc>Manage opening hours and schedules</MenuDesc>
						</MenuText>
						<MenuRight>
							<MenuChevron aria-hidden>›</MenuChevron>
						</MenuRight>
					</MenuRow>
					<MenuRow href="/notifications">
						<MenuIcon aria-hidden>🔔</MenuIcon>
						<MenuText>
							<MenuTitle>Notifications</MenuTitle>
							<MenuDesc>Alerts and updates</MenuDesc>
						</MenuText>
						<MenuRight>
							{alertCount > 0 && (
								<MenuBadge>{alertCount >= 10 ? "9+" : alertCount}</MenuBadge>
							)}
							<MenuChevron aria-hidden>›</MenuChevron>
						</MenuRight>
					</MenuRow>
					<MenuRow href="/vendor/followers">
						<MenuIcon aria-hidden>👥</MenuIcon>
						<MenuText>
							<MenuTitle>Followers & Growth</MenuTitle>
							<MenuDesc>See who follows you and milestone progress</MenuDesc>
						</MenuText>
						<MenuRight>
							<MenuChevron aria-hidden>›</MenuChevron>
						</MenuRight>
					</MenuRow>
				</MenuCard>

				<SectionTitle>Manage account</SectionTitle>
				<MenuCard>
					<MenuRow href="/vendor/settings">
						<MenuIcon aria-hidden>👤</MenuIcon>
						<MenuText>
							<MenuTitle>Profile</MenuTitle>
							<MenuDesc>Personal and business details</MenuDesc>
						</MenuText>
						<MenuRight>
							<MenuChevron aria-hidden>›</MenuChevron>
						</MenuRight>
					</MenuRow>
					<MenuRow href="/vendor/settings">
						<MenuIcon aria-hidden>🏦</MenuIcon>
						<MenuText>
							<MenuTitle>Payout settings</MenuTitle>
							<MenuDesc>Bank details and settlements</MenuDesc>
						</MenuText>
						<MenuRight>
							<MenuChevron aria-hidden>›</MenuChevron>
						</MenuRight>
					</MenuRow>
					<MenuRow href="/help?audience=vendor">
						<MenuIcon aria-hidden>💬</MenuIcon>
						<MenuText>
							<MenuTitle>Support & Help</MenuTitle>
							<MenuDesc>FAQs and contact support</MenuDesc>
						</MenuText>
						<MenuRight>
							<MenuChevron aria-hidden>›</MenuChevron>
						</MenuRight>
					</MenuRow>
					<MenuRow href="/vendor/settings">
						<MenuIcon aria-hidden>⚙️</MenuIcon>
						<MenuText>
							<MenuTitle>Settings</MenuTitle>
							<MenuDesc>Security, notifications, delivery</MenuDesc>
						</MenuText>
						<MenuRight>
							<MenuChevron aria-hidden>›</MenuChevron>
						</MenuRight>
					</MenuRow>
				</MenuCard>

				<LogoutBtn type="button" onClick={() => logout()}>
					Log out
				</LogoutBtn>
			</Stack>
		</Page>
	);
}
