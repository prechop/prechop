"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import styled from "styled-components";
import { Avatar } from "@/components/Kit";
import { useAuth } from "@/hooks/Auth/useAuth";

const Trigger = styled.button`
	display: inline-flex;
	align-items: center;
	justify-content: center;
	background: none;
	border: none;
	cursor: pointer;
	padding: 2px;
	border-radius: 999px;
	color: inherit;
	&:hover {
		background: var(--pc-surface-2);
	}
`;

const Menu = styled.div`
	position: absolute;
	top: calc(100% + 8px);
	right: 0;
	z-index: 60;
	min-width: 180px;
	padding: 6px;
	background: var(--pc-surface);
	border: 1px solid var(--pc-border);
	border-radius: var(--pc-radius);
	box-shadow: var(--pc-shadow-md);
`;

const MenuItem = styled(Link)`
	display: flex;
	align-items: center;
	gap: 8px;
	width: 100%;
	padding: 8px 10px;
	border-radius: var(--pc-radius-sm);
	font-size: 13.5px;
	font-weight: 700;
	color: var(--pc-text);
	text-decoration: none;
	white-space: nowrap;
	&:hover {
		background: var(--pc-surface-2);
	}
`;

const LogoutItem = styled.button`
	display: flex;
	align-items: center;
	gap: 8px;
	width: 100%;
	padding: 8px 10px;
	border-radius: var(--pc-radius-sm);
	font-size: 13.5px;
	font-weight: 700;
	color: var(--pc-color-danger);
	background: none;
	border: none;
	cursor: pointer;
	white-space: nowrap;
	&:hover {
		background: var(--pc-surface-2);
	}
`;

const Divider = styled.div`
	border-top: 1px solid var(--pc-border);
	margin: 4px 0;
`;

const NameRow = styled.div`
	padding: 6px 10px;
	font-size: 12px;
	font-weight: 800;
	color: var(--pc-text-muted);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	max-width: 160px;
`;

export default function AccountMenu({
	accountHref = "/account",
	logout,
}: {
	accountHref?: string;
	logout: () => Promise<void>;
}) {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);
	const { user } = useAuth();
	const fullName = `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim();

	return (
		<div ref={ref} style={{ position: "relative" }}>
			<Trigger
				onClick={() => setOpen((v) => !v)}
				aria-expanded={open}
				aria-haspopup="true"
			>
				<Avatar name={fullName} src={user?.profileImageUrl} size={34} />
			</Trigger>
			{open && (
				<Menu role="menu">
					{fullName && <NameRow>{fullName}</NameRow>}
					<MenuItem
						href={accountHref}
						role="menuitem"
						onClick={() => setOpen(false)}
					>
						👤 Account
					</MenuItem>
					<Divider />
					<LogoutItem
						role="menuitem"
						onClick={async () => {
							setOpen(false);
							await logout();
						}}
					>
						Log out
					</LogoutItem>
				</Menu>
			)}
		</div>
	);
}
