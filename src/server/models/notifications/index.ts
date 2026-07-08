import mongoose, { type ClientSession, type Model } from "mongoose";
import { MAX_LIMIT } from "../../constants";
import { databaseResponseTimeHistogram } from "../../metrics";
import { IOperationType } from "../utils";
import type { INotification, INotificationCreateInput } from "./types";

const collectionName = "notifications";

const DEFAULT_LIMIT = 20;
const MAX_NOTIFICATION_LIMIT = 100;

export type NotificationModel = Model<any>;

const schema = new mongoose.Schema<any>(
	{
		userId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "users",
			required: true,
			index: true,
		},
		title: { type: String, required: true },
		body: { type: String, required: true },
		type: { type: String, required: true },
		data: { type: mongoose.Schema.Types.Mixed, required: false },
		isRead: { type: Boolean, default: false },
	},
	{ timestamps: true },
);

schema.index({ userId: 1, isRead: 1 });

schema.pre("aggregate", function () {
	this.pipeline().push({ $addFields: { id: { $toString: "$_id" } } });
	this.pipeline().push({ $project: { __v: 0 } });
});

export const Notification: NotificationModel =
	(mongoose.models[collectionName] as NotificationModel | undefined) ??
	mongoose.model<any>(collectionName, schema);

// ── Writes ────────────────────────────────────────────────────────────────

export async function createNotificationDB({
	payload,
	session,
}: {
	payload: INotificationCreateInput;
	session?: ClientSession;
}): Promise<INotification | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		const doc = await new Notification({
			userId: payload.userId,
			title: payload.title,
			body: payload.body,
			type: payload.type,
			data: payload.data,
			isRead: payload.isRead ?? false,
		}).save({ session });
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createNotificationDB",
			success: "true",
		});
		return doc.toObject() as unknown as INotification;
	} catch {
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createNotificationDB",
			success: "false",
		});
		return null;
	}
}

export async function markNotificationReadDB({
	id,
	userId,
	session,
}: {
	id: string;
	userId: string;
	session?: ClientSession;
}): Promise<boolean> {
	try {
		if (!mongoose.Types.ObjectId.isValid(id)) return false;
		const res = await Notification.findOneAndUpdate(
			{
				_id: new mongoose.Types.ObjectId(id),
				userId: new mongoose.Types.ObjectId(userId),
			},
			{ $set: { isRead: true } },
			{ session, returnDocument: "after" },
		);
		return !!res;
	} catch {
		return false;
	}
}

export async function markAllNotificationsReadDB({
	userId,
	session,
}: {
	userId: string;
	session?: ClientSession;
}): Promise<boolean> {
	try {
		const res = await Notification.updateMany(
			{ userId: new mongoose.Types.ObjectId(userId), isRead: false },
			{ $set: { isRead: true } },
			{ session },
		);
		return res.acknowledged;
	} catch {
		return false;
	}
}

// ── Reads ─────────────────────────────────────────────────────────────────

export async function listNotificationsDB({
	userId,
	limit,
	offset,
	session,
}: {
	userId: string;
	limit?: number;
	offset?: number;
	session?: ClientSession;
}): Promise<INotification[]> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		const safeLimit = Math.min(
			Math.max(1, limit ?? DEFAULT_LIMIT),
			MAX_NOTIFICATION_LIMIT,
		);
		const safeOffset = Math.max(0, offset ?? 0);
		const result = await Notification.aggregate<INotification>(
			[
				{ $match: { userId: new mongoose.Types.ObjectId(userId) } },
				{ $sort: { createdAt: -1 } },
				{ $skip: safeOffset },
				{ $limit: safeLimit },
			],
			{ session },
		);
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "listNotificationsDB",
			success: "true",
		});
		return result;
	} catch {
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "listNotificationsDB",
			success: "false",
		});
		return [];
	}
}

export async function countUnreadNotificationsDB({
	userId,
}: {
	userId: string;
}): Promise<number> {
	try {
		return await Notification.countDocuments({
			userId: new mongoose.Types.ObjectId(userId),
			isRead: false,
		});
	} catch {
		return 0;
	}
}

export * from "./types";
export { MAX_LIMIT };
