"use client";

import type { ReactNode } from "react";
import styled, { keyframes } from "styled-components";

/* ---------------------------------------------------------------- PageHeader */

const HeaderWrap = styled.header`
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: var(--pc-space-4);
	flex-wrap: wrap;
	margin-bottom: var(--pc-space-5);
`;
const HeaderText = styled.div`
	display: flex;
	flex-direction: column;
	gap: 6px;
	min-width: 0;
`;
const Eyebrow = styled.span`
	font-size: 12px;
	font-weight: 800;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: var(--pc-color-primary);
`;
const HeaderTitle = styled.h1`
	font-family: var(--pc-font-display);
	font-size: clamp(24px, 4vw, 32px);
	font-weight: 800;
	letter-spacing: -0.03em;
	color: var(--pc-text);
`;
const HeaderSub = styled.p`
	margin: 0;
	font-size: 15px;
	color: var(--pc-text-muted);
	max-width: 60ch;
`;
const HeaderActions = styled.div`
	display: flex;
	gap: 10px;
	align-items: center;
	flex-wrap: wrap;
`;

export function PageHeader({
	eyebrow,
	title,
	subtitle,
	actions,
}: {
	eyebrow?: string;
	title: ReactNode;
	subtitle?: ReactNode;
	actions?: ReactNode;
}) {
	return (
		<HeaderWrap>
			<HeaderText>
				{eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
				<HeaderTitle>{title}</HeaderTitle>
				{subtitle && <HeaderSub>{subtitle}</HeaderSub>}
			</HeaderText>
			{actions && <HeaderActions>{actions}</HeaderActions>}
		</HeaderWrap>
	);
}

/* ------------------------------------------------------------- SectionHeader */

const SectionWrap = styled.div`
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--pc-space-4);
	margin-bottom: var(--pc-space-4);
`;
const SectionTitle = styled.h2`
	font-family: var(--pc-font-display);
	font-size: 19px;
	font-weight: 700;
	letter-spacing: -0.02em;
	color: var(--pc-text);
	display: flex;
	align-items: center;
	gap: 9px;
`;

export function SectionHeader({
	title,
	icon,
	action,
}: {
	title: ReactNode;
	icon?: ReactNode;
	action?: ReactNode;
}) {
	return (
		<SectionWrap>
			<SectionTitle>
				{icon && <span aria-hidden>{icon}</span>}
				{title}
			</SectionTitle>
			{action}
		</SectionWrap>
	);
}

/* ----------------------------------------------------------------- StatCard */

const StatWrap = styled.div<{ $tone?: string }>`
	background: var(--pc-surface);
	border: 1px solid var(--pc-border);
	border-radius: var(--pc-radius);
	box-shadow: var(--pc-shadow-sm);
	padding: var(--pc-space-5);
	display: flex;
	flex-direction: column;
	gap: 6px;
	position: relative;
	overflow: hidden;
	transition: transform var(--pc-dur) var(--pc-ease), box-shadow var(--pc-dur) var(--pc-ease);
	&:hover { transform: translateY(-2px); box-shadow: var(--pc-shadow); }
	&::after {
		content: "";
		position: absolute;
		inset: 0 0 auto 0;
		height: 3px;
		background: ${(p) => p.$tone ?? "var(--pc-gradient-warm)"};
	}
`;
const StatTop = styled.div`
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
`;
const StatLabel = styled.span`
	font-size: 13px;
	font-weight: 600;
	color: var(--pc-text-muted);
`;
const StatIcon = styled.span`
	font-size: 20px;
	line-height: 1;
`;
const StatValue = styled.div`
	font-family: var(--pc-font-display);
	font-size: 30px;
	font-weight: 800;
	letter-spacing: -0.03em;
	color: var(--pc-text);
`;
const StatHint = styled.span`
	font-size: 12.5px;
	font-weight: 600;
	color: var(--pc-text-faint);
`;

export function StatCard({
	label,
	value,
	icon,
	hint,
	tone,
}: {
	label: ReactNode;
	value: ReactNode;
	icon?: ReactNode;
	hint?: ReactNode;
	tone?: string;
}) {
	return (
		<StatWrap $tone={tone}>
			<StatTop>
				<StatLabel>{label}</StatLabel>
				{icon && <StatIcon aria-hidden>{icon}</StatIcon>}
			</StatTop>
			<StatValue>{value}</StatValue>
			{hint && <StatHint>{hint}</StatHint>}
		</StatWrap>
	);
}

/* ---------------------------------------------------------------- EmptyState */

const EmptyWrap = styled.div`
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	text-align: center;
	gap: 12px;
	padding: var(--pc-space-8) var(--pc-space-4);
	border: 1.5px dashed var(--pc-border);
	border-radius: var(--pc-radius-lg);
	background: var(--pc-surface);
`;
const EmptyIcon = styled.div`
	width: 64px;
	height: 64px;
	display: grid;
	place-items: center;
	border-radius: var(--pc-radius);
	background: var(--pc-color-primary-50);
	font-size: 30px;
`;
const EmptyTitle = styled.h3`
	font-family: var(--pc-font-display);
	font-size: 18px;
	font-weight: 700;
	color: var(--pc-text);
`;
const EmptyText = styled.p`
	margin: 0;
	font-size: 14.5px;
	color: var(--pc-text-muted);
	max-width: 44ch;
`;

export function EmptyState({
	icon = "🍽️",
	title,
	description,
	action,
}: {
	icon?: ReactNode;
	title: ReactNode;
	description?: ReactNode;
	action?: ReactNode;
}) {
	return (
		<EmptyWrap>
			<EmptyIcon aria-hidden>{icon}</EmptyIcon>
			<EmptyTitle>{title}</EmptyTitle>
			{description && <EmptyText>{description}</EmptyText>}
			{action && <div style={{ marginTop: 4 }}>{action}</div>}
		</EmptyWrap>
	);
}

/* ------------------------------------------------------------------- Avatar */

const AvatarWrap = styled.div<{ $size?: number; $src?: string }>`
	width: ${(p) => p.$size ?? 40}px;
	height: ${(p) => p.$size ?? 40}px;
	flex: 0 0 auto;
	border-radius: 50%;
	display: grid;
	place-items: center;
	font-family: var(--pc-font-display);
	font-weight: 700;
	font-size: ${(p) => (p.$size ?? 40) * 0.4}px;
	color: #fff;
	background: ${(p) => (p.$src ? `url(${p.$src}) center/cover` : "var(--pc-gradient-warm)")};
	box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.14);
	overflow: hidden;
	user-select: none;
`;

function initials(name?: string) {
	if (!name) return "?";
	const parts = name.trim().split(/\s+/);
	return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
}

export function Avatar({
	name,
	src,
	size,
}: {
	name?: string;
	src?: string;
	size?: number;
}) {
	return (
		<AvatarWrap $size={size} $src={src} aria-hidden>
			{!src && initials(name).toUpperCase()}
		</AvatarWrap>
	);
}

/* ----------------------------------------------------------------- Skeleton */

const shimmer = keyframes`100% { transform: translateX(100%); }`;

export const Skeleton = styled.div<{
	$w?: string;
	$h?: number;
	$radius?: string;
}>`
	position: relative;
	overflow: hidden;
	width: ${(p) => p.$w ?? "100%"};
	height: ${(p) => p.$h ?? 16}px;
	border-radius: ${(p) => p.$radius ?? "8px"};
	background: var(--pc-surface-2);
	&::after {
		content: "";
		position: absolute;
		inset: 0;
		transform: translateX(-100%);
		background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.14), transparent);
		animation: ${shimmer} 1.4s infinite;
	}
`;

/* --------------------------------------------------------------- FadeIn wrap */

export const FadeIn = styled.div<{ $delay?: number }>`
	animation: pc-fade-up var(--pc-dur-slow) var(--pc-ease) both;
	animation-delay: ${(p) => p.$delay ?? 0}ms;
`;
