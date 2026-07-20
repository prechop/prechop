"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import styled from "styled-components";
import useSWR from "swr";
import {
	Badge,
	Button,
	Card,
	EmptyState,
	Grid,
	PageHeader,
	Row,
	Skeleton,
	Stack,
	Text,
} from "@/components";
import { fetcher } from "@/constants/fetcher";
import {
	formatDate,
	formatDateTime,
	formatKobo,
	statusLabel,
} from "@/constants/formatters";
import type { AdminUserDetail } from "@/types";

const StatCard = styled(Card)`
  text-align: center;
`;
const StatNum = styled(Text)`
  font-size: 26px;
  font-weight: 800;
  color: var(--pc-color-primary);
`;
const KV = styled(Row)`
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--pc-border);
  &:last-child {
    border-bottom: none;
  }
`;
const Pill = styled.span`
  display: inline-flex;
  padding: 3px 9px;
  border-radius: var(--pc-radius-pill);
  background: var(--pc-surface-2);
  border: 1px solid var(--pc-border);
  font-size: 12px;
  font-weight: 700;
  margin: 0 6px 6px 0;
`;
const ListRow = styled(Row)`
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--pc-border);
  &:last-child {
    border-bottom: none;
  }
`;

function Field({ label, value }: { label: string; value: ReactNode }) {
	return (
		<KV>
			<Text $muted $size={13}>
				{label}
			</Text>
			<Text $weight={600} $size={13} style={{ textAlign: "right" }}>
				{value}
			</Text>
		</KV>
	);
}

export default function AdminUserDetailWrapper({ userId }: { userId: string }) {
	const router = useRouter();
	const { data, isLoading, error } = useSWR<AdminUserDetail>(
		`/admin/iam/users/${userId}/detail`,
		fetcher,
	);

	if (isLoading) {
		return (
			<Stack $gap={16}>
				<Skeleton style={{ height: 60 }} />
				<Grid $min={160} $gap={12}>
					{[0, 1, 2, 3].map((n) => (
						<Skeleton key={n} style={{ height: 90 }} />
					))}
				</Grid>
				<Skeleton style={{ height: 220 }} />
			</Stack>
		);
	}
	if (error || !data) {
		return (
			<Stack $gap={16}>
				<PageHeader eyebrow="Admin · IAM" title="User" />
				<EmptyState
					icon="🚫"
					title="Couldn't load this user"
					description="The user may not exist, or you don't have permission to view them."
					action={
						<Button onClick={() => router.push("/admin/iam")}>
							Back to IAM
						</Button>
					}
				/>
			</Stack>
		);
	}

	const {
		user,
		access,
		vendor,
		orders,
		reviewsWritten,
		notifications,
		activity,
	} = data;

	return (
		<Stack $gap={20}>
			<PageHeader
				eyebrow="Admin · IAM"
				title={`${user.firstName} ${user.lastName}`}
				subtitle="Full account profile and analytics."
				actions={
					<Link href="/admin/iam">
						<Button $variant="secondary" $size="sm">
							← Back to IAM
						</Button>
					</Link>
				}
			/>

			{/* Headline analytics */}
			<Grid $min={160} $gap={12}>
				<StatCard>
					<StatNum>{orders.total}</StatNum>
					<Text $muted $size={13}>
						Total orders
					</Text>
				</StatCard>
				<StatCard>
					<StatNum>{formatKobo(orders.totalSpentKobo)}</StatNum>
					<Text $muted $size={13}>
						Lifetime spend
					</Text>
				</StatCard>
				<StatCard>
					<StatNum>{reviewsWritten.count}</StatNum>
					<Text $muted $size={13}>
						Reviews written
					</Text>
				</StatCard>
				<StatCard>
					<StatNum>{notifications.unread}</StatNum>
					<Text $muted $size={13}>
						Unread alerts
					</Text>
				</StatCard>
			</Grid>

			<Grid $min={300} $gap={16}>
				{/* Identity */}
				<Card>
					<Stack $gap={8}>
						<Text $weight={800} $size={15}>
							👤 Identity
						</Text>
						<Field
							label="Status"
							value={
								<Badge
									$tone={user.isActive ? "success" : "danger"}
								>
									{user.isActive ? "Active" : "Inactive"}
								</Badge>
							}
						/>
						<Field label="Phone" value={user.phone ?? "—"} />
						<Field
							label="Campus"
							value={
								user.campusName
									? `${user.campusName}${user.campusState ? ` · ${user.campusState}` : ""}`
									: "—"
							}
						/>
						<Field
							label="Active sessions"
							value={user.activeSessions}
						/>
						<Field
							label="Last login"
							value={
								user.lastLoginAt
									? formatDateTime(user.lastLoginAt)
									: "Never"
							}
						/>
						<Field
							label="Joined"
							value={formatDate(user.createdAt)}
						/>
					</Stack>
				</Card>

				{/* Access */}
				<Card>
					<Stack $gap={8}>
						<Text $weight={800} $size={15}>
							🔐 Access
						</Text>
						<Field
							label="Effective actions"
							value={access.actionCount}
						/>
						<Field
							label="Direct policies"
							value={access.directPolicyCount}
						/>
						<Stack $gap={4} style={{ marginTop: 6 }}>
							<Text $muted $size={13}>
								Roles
							</Text>
							<div>
								{(access?.roles ?? []).length === 0 ? (
									<Text $size={13}>
										No buyer/vendor/admin role
									</Text>
								) : (
									(access?.roles ?? []).map((role) => (
										<Pill key={role}>{role}</Pill>
									))
								)}
							</div>
						</Stack>
						<Stack $gap={4} style={{ marginTop: 6 }}>
							<Text $muted $size={13}>
								Groups
							</Text>
							<div>
								{access.groups.length === 0 ? (
									<Text $size={13}>No groups</Text>
								) : (
									access.groups.map((g) => (
										<Pill key={g}>{g}</Pill>
									))
								)}
							</div>
						</Stack>
					</Stack>
				</Card>

				{/* Vendor (if any) */}
				{vendor && (
					<Card>
						<Stack $gap={8}>
							<Row $justify="space-between" $align="center">
								<Text $weight={800} $size={15}>
									🏪 Vendor profile
								</Text>
								<Link href={`/v/${vendor.id}`}>
									<Button $variant="secondary" $size="sm">
										Storefront
									</Button>
								</Link>
							</Row>
							<Field
								label="Business"
								value={vendor.businessName ?? "—"}
							/>
							<Field
								label="Status"
								value={
									<Badge $tone="muted">{vendor.status}</Badge>
								}
							/>
							<Field
								label="Open for orders"
								value={vendor.isOpenForOrders ? "Yes" : "No"}
							/>
							<Field
								label="Rating"
								value={`⭐ ${vendor.reviewsReceived.avg.toFixed(1)} (${vendor.reviewsReceived.count})`}
							/>
							<Field
								label="Total orders"
								value={vendor.totalOrders}
							/>
							<Field
								label="Completion rate"
								value={`${vendor.completionRate}%`}
							/>
						</Stack>
					</Card>
				)}

				{/* Order status breakdown */}
				<Card>
					<Stack $gap={8}>
						<Text $weight={800} $size={15}>
							📦 Orders by status
						</Text>
						{Object.keys(orders.byStatus).length === 0 ? (
							<Text $muted $size={13}>
								No orders yet.
							</Text>
						) : (
							Object.entries(orders.byStatus).map(([s, n]) => (
								<Field
									key={s}
									label={statusLabel(s)}
									value={n}
								/>
							))
						)}
					</Stack>
				</Card>
			</Grid>

			{/* Recent orders */}
			<Card>
				<Stack $gap={8}>
					<Text $weight={800} $size={15}>
						🧾 Recent orders
					</Text>
					{orders.recent.length === 0 ? (
						<Text $muted $size={13}>
							No orders yet.
						</Text>
					) : (
						orders.recent.map((o) => (
							<ListRow key={o.id}>
								<Stack $gap={2}>
									<Text $weight={700} $size={13}>
										{o.orderNumber}
									</Text>
									<Text $muted $size={12}>
										{formatDateTime(o.createdAt)}
									</Text>
								</Stack>
								<Row $gap={10} $align="center">
									<Badge $tone="muted">
										{statusLabel(o.status)}
									</Badge>
									<Text $weight={700} $size={13}>
										{formatKobo(o.totalKobo)}
									</Text>
								</Row>
							</ListRow>
						))
					)}
				</Stack>
			</Card>

			<Grid $min={300} $gap={16}>
				{/* Reviews written */}
				<Card>
					<Stack $gap={8}>
						<Text $weight={800} $size={15}>
							✍️ Reviews written
						</Text>
						{reviewsWritten.recent.length === 0 ? (
							<Text $muted $size={13}>
								None yet.
							</Text>
						) : (
							reviewsWritten.recent.map((r) => (
								<ListRow key={r.id}>
									<Stack $gap={2}>
										<Text $weight={700} $size={13}>
											{"⭐".repeat(r.rating)}
										</Text>
										{r.comment && (
											<Text $muted $size={12}>
												{r.comment}
											</Text>
										)}
									</Stack>
									<Text $muted $size={12}>
										{formatDate(r.createdAt)}
									</Text>
								</ListRow>
							))
						)}
					</Stack>
				</Card>

				{/* Recent activity */}
				<Card>
					<Stack $gap={8}>
						<Text $weight={800} $size={15}>
							🕓 Recent activity
						</Text>
						{activity.recent.length === 0 ? (
							<Text $muted $size={13}>
								No recorded activity.
							</Text>
						) : (
							activity.recent.map((a) => (
								<ListRow key={a.id}>
									<Stack $gap={2}>
										<Text $weight={700} $size={13}>
											{a.action}
										</Text>
										<Text $muted $size={12}>
											{a.resourceType}
											{a.ipAddress
												? ` · ${a.ipAddress}`
												: ""}
										</Text>
									</Stack>
									<Text $muted $size={12}>
										{formatDateTime(a.createdAt)}
									</Text>
								</ListRow>
							))
						)}
					</Stack>
				</Card>
			</Grid>

			{/* Notifications */}
			<Card>
				<Stack $gap={8}>
					<Text $weight={800} $size={15}>
						🔔 Recent notifications
					</Text>
					{notifications.recent.length === 0 ? (
						<Text $muted $size={13}>
							No notifications.
						</Text>
					) : (
						notifications.recent.map((n) => (
							<ListRow key={n.id}>
								<Stack $gap={2}>
									<Text $weight={700} $size={13}>
										{n.title}
									</Text>
									<Text $muted $size={12}>
										{n.body}
									</Text>
								</Stack>
								<Badge $tone={n.isRead ? "muted" : "primary"}>
									{n.isRead ? "Read" : "New"}
								</Badge>
							</ListRow>
						))
					)}
				</Stack>
			</Card>
		</Stack>
	);
}
