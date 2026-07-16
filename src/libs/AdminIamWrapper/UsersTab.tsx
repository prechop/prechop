"use client";

import Link from "next/link";
import { useState } from "react";
import styled from "styled-components";
import useSWR from "swr";
import { Button, Card, Input, Row, Skeleton, Stack, Text } from "@/components";
import { api, apiData } from "@/constants/api";
import { fetcher } from "@/constants/fetcher";
import { useToast } from "@/hooks/useToast";

type RoleFilter = "all" | "buyers" | "vendors" | "both" | "admins";

interface UserRow {
  id: string;
  firstName: string;
  lastName: string;
  groupIds: string[];
  directPolicyIds: string[];
}
interface UsersResult {
  users: UserRow[];
  total: number;
  page: number;
}
interface NamedRef {
  id?: string;
  _id?: string;
  name: string;
}

const ROLE_TABS: Array<{ id: RoleFilter; label: string }> = [
  { id: "all", label: "All Users" },
  { id: "buyers", label: "Buyers" },
  { id: "vendors", label: "Vendors" },
  { id: "both", label: "Buyers & Vendors" },
  { id: "admins", label: "Admins" },
];

const Tabs = styled.div`
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
`;

const TabButton = styled.button<{ $active: boolean }>`
  border: 1px solid
    ${(p) => (p.$active ? "var(--pc-color-primary)" : "var(--pc-border)")};
  background: ${(p) =>
    p.$active ? "var(--pc-color-primary-50)" : "var(--pc-surface)"};
  color: ${(p) =>
    p.$active ? "var(--pc-color-primary)" : "var(--pc-text-muted)"};
  border-radius: var(--pc-radius-sm);
  padding: 9px 12px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
`;

const RowEl = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--pc-border);
  &:last-child {
    border-bottom: none;
  }
`;

const Check = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  margin: 0 14px 6px 0;
  cursor: pointer;
`;

export default function UsersTab() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<RoleFilter>("all");
  const query = new URLSearchParams();
  if (search) query.set("search", search);
  if (role !== "all") query.set("role", role);
  const { data, isLoading, mutate } = useSWR<UsersResult>(
    `/admin/iam/users${query.toString() ? `?${query.toString()}` : ""}`,
    fetcher,
  );
  const { data: groups } = useSWR<NamedRef[]>("/admin/iam/groups", fetcher);
  const { data: policies } = useSWR<NamedRef[]>("/admin/iam/policies", fetcher);

  const [editing, setEditing] = useState<string | null>(null);
  const [gSel, setGSel] = useState<Set<string>>(new Set());
  const [pSel, setPSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const rid = (r: NamedRef) => (r.id ?? r._id) as string;

  function beginEdit(u: UserRow) {
    setEditing(editing === u.id ? null : u.id);
    setGSel(new Set(u.groupIds));
    setPSel(new Set(u.directPolicyIds));
  }

  function toggle(
    set: Set<string>,
    id: string,
    apply: (s: Set<string>) => void,
  ) {
    const n = new Set(set);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    apply(n);
  }

  async function save(u: UserRow) {
    setBusy(true);
    try {
      await apiData(
        api.put(`/admin/iam/users/${u.id}/groups`, {
          groupIds: [...gSel],
        }),
      );
      await apiData(
        api.put(`/admin/iam/users/${u.id}/policies`, {
          policyIds: [...pSel],
        }),
      );
      toast("Access updated.", "success");
      setEditing(null);
      await mutate();
    } catch {
      toast("Update rejected (last admin / self-lockout guard).", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack $gap={16}>
      <Tabs aria-label="IAM user role filters">
        {ROLE_TABS.map((tab) => (
          <TabButton
            key={tab.id}
            type="button"
            $active={role === tab.id}
            onClick={() => setRole(tab.id)}>
            {tab.label}
          </TabButton>
        ))}
      </Tabs>
      <Input
        placeholder="Search users by name..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <Card>
        {isLoading ? (
          <Skeleton style={{ height: 160 }} />
        ) : (data?.users ?? []).length === 0 ? (
          <Text $muted>No users found.</Text>
        ) : (
          (data?.users ?? []).map((u) => (
            <div key={u.id}>
              <RowEl>
                <div>
                  <Text $weight={700}>
                    {u.firstName} {u.lastName}
                  </Text>
                  <Text $muted $size={12}>
                    {u.groupIds.length} group(s) · {u.directPolicyIds.length}{" "}
                    direct policy(ies)
                  </Text>
                </div>
                <Row $gap={8} $align="center">
                  <Link href={`/admin/iam/users/${u.id}`}>
                    <Button $variant="secondary" $size="sm">
                      View
                    </Button>
                  </Link>
                  <Button
                    $variant="ghost"
                    $size="sm"
                    onClick={() => beginEdit(u)}>
                    {editing === u.id ? "Close" : "Manage"}
                  </Button>
                </Row>
              </RowEl>
              {editing === u.id && (
                <Card
                  style={{
                    margin: "10px 0",
                    background: "var(--pc-surface-2)",
                  }}>
                  <Text $weight={700} $size={13}>
                    Groups
                  </Text>
                  <div style={{ margin: "6px 0 12px" }}>
                    {(groups ?? []).map((g) => (
                      <Check key={rid(g)}>
                        <input
                          type="checkbox"
                          checked={gSel.has(rid(g))}
                          onChange={() => toggle(gSel, rid(g), setGSel)}
                        />
                        {g.name}
                      </Check>
                    ))}
                  </div>
                  <Text $weight={700} $size={13}>
                    Direct policies
                  </Text>
                  <div style={{ margin: "6px 0 12px" }}>
                    {(policies ?? []).map((p) => (
                      <Check key={rid(p)}>
                        <input
                          type="checkbox"
                          checked={pSel.has(rid(p))}
                          onChange={() => toggle(pSel, rid(p), setPSel)}
                        />
                        {p.name}
                      </Check>
                    ))}
                  </div>
                  <Button
                    $size="sm"
                    $loading={busy}
                    disabled={busy}
                    onClick={() => save(u)}>
                    Save access
                  </Button>
                </Card>
              )}
            </div>
          ))
        )}
      </Card>
    </Stack>
  );
}
