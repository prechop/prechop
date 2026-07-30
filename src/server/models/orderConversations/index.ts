import mongoose, { type ClientSession, type Model } from "mongoose";
import { MAX_LIMIT } from "../../constants";
import { OrderStatus } from "../enums";
import type {
	IOrderConversation,
	IOrderConversationCreateInput,
	OrderConversationSenderRole,
} from "./types";

export * from "./types";

const collectionName = "orderConversations";

export type OrderConversationModel = Model<any>;

const messageSchema = new mongoose.Schema(
	{
		clientMessageId: { type: String, maxlength: 80 },
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
		body: { type: String, required: true, maxlength: 1000 },
		createdAt: { type: Date, default: Date.now },
	},
	{ _id: true },
);

const schema = new mongoose.Schema<any>(
	{
		buyerOrderId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "buyerOrders",
			required: true,
			unique: true,
			index: true,
		},
		buyerId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "users",
			required: true,
			index: true,
		},
		vendorId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "vendorProfiles",
			required: true,
			index: true,
		},
		vendorUserId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "users",
			required: true,
			index: true,
		},
		orderStatus: {
			type: String,
			enum: Object.values(OrderStatus),
			required: true,
			index: true,
		},
		messages: { type: [messageSchema], default: [] },
		buyerLastReadAt: { type: Date },
		vendorLastReadAt: { type: Date },
		lastMessageAt: { type: Date, index: true },
		lastMessagePreview: { type: String, maxlength: 160 },
		closedAt: { type: Date },
	},
	{ timestamps: true },
);

schema.index({ buyerId: 1, lastMessageAt: -1 });
schema.index({ vendorUserId: 1, lastMessageAt: -1 });

schema.pre("aggregate", function () {
	this.pipeline().push({
		$addFields: {
			id: { $toString: "$_id" },
			buyerOrderId: { $toString: "$buyerOrderId" },
			buyerId: { $toString: "$buyerId" },
			vendorId: { $toString: "$vendorId" },
			vendorUserId: { $toString: "$vendorUserId" },
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
		},
	});
	this.pipeline().push({ $project: { __v: 0 } });
});

export const OrderConversation: OrderConversationModel =
	(mongoose.models[collectionName] as OrderConversationModel | undefined) ??
	mongoose.model<any>(collectionName, schema);

function oid(id: string) {
	return new mongoose.Types.ObjectId(id);
}

export async function ensureOrderConversationDB({
	payload,
	session,
}: {
	payload: IOrderConversationCreateInput;
	session?: ClientSession;
}): Promise<IOrderConversation | null> {
	try {
		if (
			!mongoose.Types.ObjectId.isValid(payload.buyerOrderId) ||
			!mongoose.Types.ObjectId.isValid(payload.buyerId) ||
			!mongoose.Types.ObjectId.isValid(payload.vendorId) ||
			!mongoose.Types.ObjectId.isValid(payload.vendorUserId)
		) {
			return null;
		}
		await OrderConversation.updateOne(
			{ buyerOrderId: oid(payload.buyerOrderId) },
			{
				$setOnInsert: {
					buyerOrderId: oid(payload.buyerOrderId),
					buyerId: oid(payload.buyerId),
					vendorId: oid(payload.vendorId),
					vendorUserId: oid(payload.vendorUserId),
					messages: [],
				},
				$set: { orderStatus: payload.orderStatus },
			},
			{ upsert: true, session },
		);
		return getOrderConversationByOrderIdDB({
			buyerOrderId: payload.buyerOrderId,
			session,
		});
	} catch {
		return null;
	}
}

export async function getOrderConversationByOrderIdDB({
	buyerOrderId,
	session,
}: {
	buyerOrderId: string;
	session?: ClientSession;
}): Promise<IOrderConversation | null> {
	try {
		if (!mongoose.Types.ObjectId.isValid(buyerOrderId)) return null;
		const [row] = await OrderConversation.aggregate<IOrderConversation>(
			[{ $match: { buyerOrderId: oid(buyerOrderId) } }, { $limit: 1 }],
			{ session },
		);
		return row ?? null;
	} catch {
		return null;
	}
}

export async function listOrderConversationsForBuyerDB({
	buyerId,
	limit = 50,
	session,
}: {
	buyerId: string;
	limit?: number;
	session?: ClientSession;
}): Promise<IOrderConversation[]> {
	try {
		if (!mongoose.Types.ObjectId.isValid(buyerId)) return [];
		return await OrderConversation.aggregate<IOrderConversation>(
			[
				{ $match: { buyerId: oid(buyerId) } },
				{ $sort: { lastMessageAt: -1, updatedAt: -1 } },
				{ $limit: Math.min(Math.max(limit, 1), MAX_LIMIT) },
			],
			{ session },
		);
	} catch {
		return [];
	}
}

export async function listOrderConversationsForVendorUserDB({
	vendorUserId,
	limit = 50,
	session,
}: {
	vendorUserId: string;
	limit?: number;
	session?: ClientSession;
}): Promise<IOrderConversation[]> {
	try {
		if (!mongoose.Types.ObjectId.isValid(vendorUserId)) return [];
		return await OrderConversation.aggregate<IOrderConversation>(
			[
				{ $match: { vendorUserId: oid(vendorUserId) } },
				{ $sort: { lastMessageAt: -1, updatedAt: -1 } },
				{ $limit: Math.min(Math.max(limit, 1), MAX_LIMIT) },
			],
			{ session },
		);
	} catch {
		return [];
	}
}

export async function addOrderConversationMessageDB({
	buyerOrderId,
	senderId,
	senderRole,
	body,
	clientMessageId,
	orderStatus,
	session,
}: {
	buyerOrderId: string;
	senderId: string;
	senderRole: OrderConversationSenderRole;
	body: string;
	clientMessageId?: string;
	orderStatus: OrderStatus;
	session?: ClientSession;
}): Promise<IOrderConversation | null> {
	try {
		if (!mongoose.Types.ObjectId.isValid(buyerOrderId)) return null;
		const existing = clientMessageId
			? await OrderConversation.findOne({
					buyerOrderId: oid(buyerOrderId),
					"messages.clientMessageId": clientMessageId,
				}).lean()
			: null;
		if (existing) {
			return getOrderConversationByOrderIdDB({ buyerOrderId, session });
		}
		const now = new Date();
		const res = await OrderConversation.findOneAndUpdate(
			{ buyerOrderId: oid(buyerOrderId) },
			{
				$push: {
					messages: {
						...(clientMessageId ? { clientMessageId } : {}),
						senderId: oid(senderId),
						senderRole,
						body,
						createdAt: now,
					},
				},
				$set: {
					orderStatus,
					lastMessageAt: now,
					lastMessagePreview: body.slice(0, 160),
					...(senderRole === "BUYER" ? { buyerLastReadAt: now } : {}),
					...(senderRole === "VENDOR"
						? { vendorLastReadAt: now }
						: {}),
				},
			},
			{ session, returnDocument: "after" },
		);
		if (!res) return null;
		return getOrderConversationByOrderIdDB({ buyerOrderId, session });
	} catch {
		return null;
	}
}

export async function markOrderConversationReadDB({
	buyerOrderId,
	role,
	readAt = new Date(),
	session,
}: {
	buyerOrderId: string;
	role: "buyer" | "vendor";
	readAt?: Date;
	session?: ClientSession;
}): Promise<IOrderConversation | null> {
	try {
		if (!mongoose.Types.ObjectId.isValid(buyerOrderId)) return null;
		await OrderConversation.updateOne(
			{ buyerOrderId: oid(buyerOrderId) },
			{
				$set: {
					[role === "buyer" ? "buyerLastReadAt" : "vendorLastReadAt"]:
						readAt,
				},
			},
			{ session },
		);
		return getOrderConversationByOrderIdDB({ buyerOrderId, session });
	} catch {
		return null;
	}
}
