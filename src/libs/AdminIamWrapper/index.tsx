"use client";

import { useState } from "react";
import styled from "styled-components";
import { PageHeader, Stack } from "@/components";
import GroupsTab from "./GroupsTab";
import PoliciesTab from "./PoliciesTab";
import UsersTab from "./UsersTab";

type Tab = "users" | "groups" | "policies";

const Tabs = styled.div`
	display: flex;
	gap: 6px;
	border-bottom: 1px solid var(--pc-border);
`;
const TabBtn = styled.button<{ $active: boolean }>`
	background: none;
	border: none;
	padding: 10px 16px;
	font-size: 14px;
	font-weight: 700;
	cursor: pointer;
	color: ${(p) => (p.$active ? "var(--pc-color-primary)" : "var(--pc-text-muted)")};
	border-bottom: 2px solid
		${(p) => (p.$active ? "var(--pc-color-primary)" : "transparent")};
`;

export default function AdminIamWrapper() {
	const [tab, setTab] = useState<Tab>("users");

	return (
		<Stack $gap={20}>
			<PageHeader
				eyebrow="Access management"
				title="IAM"
				subtitle="Manage users, groups and managed policies. Permissions come only from policies attached to groups or directly to a user."
			/>
			<Tabs>
				<TabBtn
					$active={tab === "users"}
					onClick={() => setTab("users")}
				>
					Users
				</TabBtn>
				<TabBtn
					$active={tab === "groups"}
					onClick={() => setTab("groups")}
				>
					Groups
				</TabBtn>
				<TabBtn
					$active={tab === "policies"}
					onClick={() => setTab("policies")}
				>
					Policies
				</TabBtn>
			</Tabs>
			{tab === "users" && <UsersTab />}
			{tab === "groups" && <GroupsTab />}
			{tab === "policies" && <PoliciesTab />}
		</Stack>
	);
}
