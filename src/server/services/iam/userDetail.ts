import { decrypt, ErrUserNotFound } from "../../constants";
import {
	aggregateBuyerOrderStatsDB,
	countUnreadNotificationsDB,
	getCampusByIdDB,
	getUserByIdWithPhoneDB,
	getVendorProfileByUserIdDB,
	getVendorRatingAggregateDB,
	listAuditLogsByUserDB,
	listBuyerOrdersByBuyerDB,
	listNotificationsDB,
	listReviewsByBuyerDB,
} from "../../models";
import { resolvePermissions } from "./resolvePermissions";

/**
 * Everything an admin can see about a single user, in one payload: identity,
 * resolved IAM access, vendor profile (if any), order analytics, reviews they
 * wrote, notifications, and recent activity. Gated by `iam:user:read`.
 */
export async function getUserAdminDetail(id: string) {
	const user = await getUserByIdWithPhoneDB({ id });
	if (!user) throw ErrUserNotFound;

	let phone: string | null = null;
	try {
		phone = user.phone ? decrypt(user.phone) : null;
	} catch {
		phone = null; // undecryptable/corrupt — never leak ciphertext
	}

	const campusId = user.campusId?.toString() ?? "";
	const [
		access,
		campus,
		vendor,
		orderStats,
		recentOrders,
		reviews,
		unread,
		notifications,
		activity,
	] = await Promise.all([
		resolvePermissions(id),
		campusId ? getCampusByIdDB({ id: campusId }) : Promise.resolve(null),
		getVendorProfileByUserIdDB({ userId: id }),
		aggregateBuyerOrderStatsDB({ buyerId: id }),
		listBuyerOrdersByBuyerDB({ buyerId: id, limit: 8 }),
		listReviewsByBuyerDB({ buyerId: id, limit: 5 }),
		countUnreadNotificationsDB({ userId: id }),
		listNotificationsDB({ userId: id, limit: 6 }),
		listAuditLogsByUserDB({ userId: id, limit: 8 }),
	]);

	let vendorBlock: {
		id: string;
		businessName: string | null;
		status: string;
		rating: number;
		totalReviews: number;
		totalOrders: number;
		completionRate: number;
		isOpenForOrders: boolean;
		reviewsReceived: { avg: number; count: number };
	} | null = null;
	if (vendor) {
		const vendorId = vendor._id.toString();
		const received = await getVendorRatingAggregateDB({ vendorId });
		vendorBlock = {
			id: vendorId,
			businessName: vendor.businessName ?? null,
			status: vendor.status,
			rating: vendor.rating ?? 0,
			totalReviews: vendor.totalReviews ?? 0,
			totalOrders: vendor.totalOrders ?? 0,
			completionRate: vendor.completionRate ?? 0,
			isOpenForOrders: vendor.isOpenForOrders ?? false,
			reviewsReceived: {
				avg: received?.avg ?? 0,
				count: received?.count ?? 0,
			},
		};
	}

	return {
		user: {
			id,
			firstName: user.firstName,
			lastName: user.lastName,
			phone,
			campusId,
			campusName: campus?.name ?? null,
			campusState: campus?.state ?? null,
			isActive: user.isActive,
			lastLoginAt: user.lastLoginAt ?? null,
			activeSessions: (user.refreshTokens ?? []).length,
			createdAt: user.createdAt,
			updatedAt: user.updatedAt,
		},
		access: {
			groups: access.groups,
			actionCount: access.actions.length,
			directPolicyCount: (user.directPolicyIds ?? []).length,
		},
		vendor: vendorBlock,
		orders: {
			total: orderStats.total,
			byStatus: orderStats.byStatus,
			totalSpentKobo: orderStats.totalSpentKobo,
			recent: recentOrders.map((o) => ({
				id: o._id.toString(),
				orderNumber: o.orderNumber,
				status: o.status,
				totalKobo: o.totalKobo,
				createdAt: o.createdAt,
			})),
		},
		reviewsWritten: {
			count: reviews.length,
			recent: reviews.map((r) => ({
				id: r._id.toString(),
				vendorId: r.vendorId.toString(),
				rating: r.rating,
				comment: r.comment ?? null,
				createdAt: r.createdAt,
			})),
		},
		notifications: {
			unread,
			recent: notifications.map((n) => ({
				id: n._id.toString(),
				title: n.title,
				body: n.body,
				isRead: n.isRead,
				createdAt: n.createdAt,
			})),
		},
		activity: {
			recent: activity.map((a) => ({
				id: a._id?.toString(),
				action: a.action,
				resourceType: a.resourceType,
				ipAddress: a.ipAddress ?? null,
				createdAt: a.createdAt,
			})),
		},
	};
}

export type AdminUserDetail = Awaited<ReturnType<typeof getUserAdminDetail>>;
