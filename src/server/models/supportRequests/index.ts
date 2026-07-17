import mongoose, { type ClientSession, type Model } from "mongoose";
import { MAX_LIMIT } from "../../constants";
import type {
	ISupportRequest,
	ISupportRequestCreateInput,
	SupportStatus,
} from "./types";

export * from "./types";

const collectionName = "supportRequests";

export type SupportRequestModel = Model<any>;

const messageSchema = new mongoose.Schema(
	{
		senderId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "users",
			required: true,
		},
		senderRole: {
			type: String,
			enum: ["BUYER", "VENDOR", "ADMIN"],
			required: true,
		},
		body: { type: String, required: true, maxlength: 2000 },
		createdAt: { type: Date, default: Date.now },
	},
	{ _id: true },
);

const schema = new mongoose.Schema<any>(
	{
		userId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "users",
			required: true,
			index: true,
		},
		senderRole: {
			type: String,
			enum: ["BUYER", "VENDOR", "ADMIN"],
			required: true,
		},
		category: {
			type: String,
			enum: [
				"ORDER",
				"PAYMENT",
				"REFUND",
				"VENDOR_ACCOUNT",
				"MENU",
				"SETTLEMENT",
				"TECHNICAL",
				"OTHER",
			],
			required: true,
			index: true,
		},
		subject: { type: String, required: true, maxlength: 140 },
		status: {
			type: String,
			enum: ["OPEN", "PENDING_USER", "RESOLVED", "CLOSED"],
			default: "OPEN",
			index: true,
		},
		assignedAdminId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "users",
		},
		relatedOrderRef: { type: String, maxlength: 80 },
		relatedPaymentRef: { type: String, maxlength: 120 },
		messages: { type: [messageSchema], default: [] },
	},
	{ timestamps: true },
);

schema.index({ status: 1, updatedAt: -1 });

schema.pre("aggregate", function () {
	this.pipeline().push({
		$addFields: {
			id: { $toString: "$_id" },
			messages: {
				$map: {
					input: { $ifNull: ["$messages", []] },
					as: "msg",
					in: {
						$mergeObjects: [
							"$$msg",
							{
								id: { $toString: "$$msg._id" },
								senderId: { $toString: "$$msg.senderId" },
							},
						],
					},
				},
			},
			userId: { $toString: "$userId" },
			assignedAdminId: {
				$cond: [
					"$assignedAdminId",
					{ $toString: "$assignedAdminId" },
					null,
				],
			},
		},
	});
	this.pipeline().push({ $project: { __v: 0 } });
});

export const SupportRequest: SupportRequestModel =
	(mongoose.models[collectionName] as SupportRequestModel | undefined) ??
	mongoose.model<any>(collectionName, schema);

export async function createSupportRequestDB({
	payload,
	session,
}: {
	payload: ISupportRequestCreateInput;
	session?: ClientSession;
}): Promise<ISupportRequest | null> {
	try {
		const doc = await new SupportRequest({
			userId: new mongoose.Types.ObjectId(payload.userId),
			senderRole: payload.senderRole,
			category: payload.category,
			subject: payload.subject,
			relatedOrderRef: payload.relatedOrderRef,
			relatedPaymentRef: payload.relatedPaymentRef,
			messages: [
				{
					senderId: new mongoose.Types.ObjectId(payload.userId),
					senderRole: payload.senderRole,
					body: payload.message,
					createdAt: new Date(),
				},
			],
		}).save({ session });
		const [row] = await SupportRequest.aggregate<ISupportRequest>(
			[{ $match: { _id: doc._id } }, { $limit: 1 }],
			{ session },
		);
		return row ?? null;
	} catch {
		return null;
	}
}

export async function listSupportRequestsByUserDB({
	userId,
	limit = 20,
	session,
}: {
	userId: string;
	limit?: number;
	session?: ClientSession;
}): Promise<ISupportRequest[]> {
	try {
		return await SupportRequest.aggregate<ISupportRequest>(
			[
				{ $match: { userId: new mongoose.Types.ObjectId(userId) } },
				{ $sort: { updatedAt: -1 } },
				{ $limit: Math.min(Math.max(limit, 1), MAX_LIMIT) },
			],
			{ session },
		);
	} catch {
		return [];
	}
}

export async function listSupportRequestsDB({
	status,
	limit = 50,
	session,
}: {
	status?: SupportStatus;
	limit?: number;
	session?: ClientSession;
} = {}): Promise<ISupportRequest[]> {
	try {
		return await SupportRequest.aggregate<ISupportRequest>(
			[
				...(status ? [{ $match: { status } }] : []),
				{ $sort: { updatedAt: -1 } },
				{ $limit: Math.min(Math.max(limit, 1), MAX_LIMIT) },
			],
			{ session },
		);
	} catch {
		return [];
	}
}

export async function getSupportRequestByIdDB({
	id,
	session,
}: {
	id: string;
	session?: ClientSession;
}): Promise<ISupportRequest | null> {
	try {
		if (!mongoose.Types.ObjectId.isValid(id)) return null;
		const [row] = await SupportRequest.aggregate<ISupportRequest>(
			[
				{ $match: { _id: new mongoose.Types.ObjectId(id) } },
				{ $limit: 1 },
			],
			{ session },
		);
		return row ?? null;
	} catch {
		return null;
	}
}

export async function addSupportMessageDB({
	id,
	senderId,
	senderRole,
	body,
	nextStatus,
	session,
}: {
	id: string;
	senderId: string;
	senderRole: "BUYER" | "VENDOR" | "ADMIN";
	body: string;
	nextStatus: SupportStatus;
	session?: ClientSession;
}): Promise<ISupportRequest | null> {
	try {
		const res = await SupportRequest.findOneAndUpdate(
			{ _id: new mongoose.Types.ObjectId(id) },
			{
				$push: {
					messages: {
						senderId: new mongoose.Types.ObjectId(senderId),
						senderRole,
						body,
						createdAt: new Date(),
					},
				},
				$set: { status: nextStatus },
			},
			{ session, returnDocument: "after" },
		);
		if (!res) return null;
		return getSupportRequestByIdDB({ id, session });
	} catch {
		return null;
	}
}

export async function updateSupportRequestDB({
	id,
	status,
	assignedAdminId,
	session,
}: {
	id: string;
	status?: SupportStatus;
	assignedAdminId?: string;
	session?: ClientSession;
}): Promise<ISupportRequest | null> {
	try {
		const $set: Record<string, unknown> = {};
		if (status) $set.status = status;
		if (assignedAdminId) {
			$set.assignedAdminId = new mongoose.Types.ObjectId(assignedAdminId);
		}
		const res = await SupportRequest.findOneAndUpdate(
			{ _id: new mongoose.Types.ObjectId(id) },
			{ $set },
			{ session, returnDocument: "after" },
		);
		if (!res) return null;
		return getSupportRequestByIdDB({ id, session });
	} catch {
		return null;
	}
}
