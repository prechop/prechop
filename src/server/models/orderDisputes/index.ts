import mongoose, { type ClientSession, type Model } from "mongoose";
import { ErrResourceNotFound } from "../../constants";
import { databaseResponseTimeHistogram } from "../../metrics";
import { IOperationType } from "../utils";
import {
	type IOrderDispute,
	type IOrderDisputeCreateInput,
	ORDER_DISPUTE_ACTIONS,
	ORDER_DISPUTE_REASONS,
	ORDER_DISPUTE_STATUSES,
	type OrderDisputeAction,
	type OrderDisputeStatus,
} from "./types";

const collectionName = "orderDisputes";

export type OrderDisputeModel = Model<any>;

const schema = new mongoose.Schema<any>(
	{
		buyerOrderId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "buyerOrders",
			required: true,
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
		reason: {
			type: String,
			enum: ORDER_DISPUTE_REASONS,
			required: true,
			index: true,
		},
		status: {
			type: String,
			enum: ORDER_DISPUTE_STATUSES,
			default: "OPEN",
			index: true,
		},
		evidence: {
			orderSnapshot: { type: mongoose.Schema.Types.Mixed },
			menuSnapshot: { type: mongoose.Schema.Types.Mixed },
			paymentRecord: { type: mongoose.Schema.Types.Mixed },
			timeline: { type: [mongoose.Schema.Types.Mixed], default: [] },
			qrPinConfirmation: { type: mongoose.Schema.Types.Mixed },
			messages: { type: [mongoose.Schema.Types.Mixed], default: [] },
			photos: { type: [String], default: [] },
			vendorNotes: { type: [String], default: [] },
			buyerNotes: { type: [String], default: [] },
		},
		resolutionAction: {
			type: String,
			enum: ORDER_DISPUTE_ACTIONS,
		},
		resolutionNote: { type: String },
		resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
		resolvedAt: { type: Date },
	},
	{ timestamps: true },
);

schema.index({ buyerOrderId: 1, reason: 1 }, { unique: true });

schema.pre("aggregate", function () {
	this.pipeline().push({ $addFields: { id: { $toString: "$_id" } } });
	this.pipeline().push({ $project: { __v: 0 } });
});

export const OrderDispute: OrderDisputeModel =
	(mongoose.models[collectionName] as OrderDisputeModel | undefined) ??
	mongoose.model<any>(collectionName, schema);

export async function createOrderDisputeDB({
	payload,
	session,
}: {
	payload: IOrderDisputeCreateInput;
	session?: ClientSession;
}): Promise<IOrderDispute | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		const res = await OrderDispute.findOneAndUpdate(
			{
				buyerOrderId: new mongoose.Types.ObjectId(payload.buyerOrderId),
				reason: payload.reason,
			},
			{
				$setOnInsert: {
					buyerOrderId: new mongoose.Types.ObjectId(
						payload.buyerOrderId,
					),
					buyerId: new mongoose.Types.ObjectId(payload.buyerId),
					vendorId: new mongoose.Types.ObjectId(payload.vendorId),
					reason: payload.reason,
					status: payload.status ?? "OPEN",
					evidence: payload.evidence,
				},
			},
			{
				session,
				upsert: true,
				returnDocument: "after",
				setDefaultsOnInsert: true,
				runValidators: true,
			},
		);
		if (!res) throw ErrResourceNotFound;
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createOrderDisputeDB",
			success: "true",
		});
		return res.toObject() as unknown as IOrderDispute;
	} catch {
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createOrderDisputeDB",
			success: "false",
		});
		return null;
	}
}

export async function getOrderDisputeByIdDB({
	id,
	session,
}: {
	id: string;
	session?: ClientSession;
}): Promise<IOrderDispute | null> {
	try {
		if (!mongoose.Types.ObjectId.isValid(id)) return null;
		return (
			(
				await OrderDispute.aggregate<IOrderDispute>(
					[
						{ $match: { _id: new mongoose.Types.ObjectId(id) } },
						{ $limit: 1 },
					],
					{ session },
				)
			).at(0) ?? null
		);
	} catch {
		return null;
	}
}

export async function listOrderDisputesDB({
	status,
	limit = 50,
	offset = 0,
	session,
}: {
	status?: OrderDisputeStatus;
	limit?: number;
	offset?: number;
	session?: ClientSession;
} = {}): Promise<IOrderDispute[]> {
	try {
		const filter: Record<string, unknown> = {};
		if (status) filter.status = status;
		return await OrderDispute.aggregate<IOrderDispute>(
			[
				{ $match: filter },
				{ $sort: { createdAt: -1 } },
				{ $skip: offset },
				{ $limit: Math.min(Math.max(limit, 1), 100) },
			],
			{ session },
		);
	} catch {
		return [];
	}
}

export async function updateOrderDisputeReviewDB({
	id,
	status,
	action,
	note,
	adminUserId,
	resolvedAt,
	session,
}: {
	id: string;
	status: OrderDisputeStatus;
	action?: OrderDisputeAction;
	note?: string;
	adminUserId?: string;
	resolvedAt?: Date;
	session?: ClientSession;
}): Promise<IOrderDispute | null> {
	try {
		if (!mongoose.Types.ObjectId.isValid(id)) return null;
		const res = await OrderDispute.findByIdAndUpdate(
			new mongoose.Types.ObjectId(id),
			{
				$set: {
					status,
					...(action ? { resolutionAction: action } : {}),
					...(note ? { resolutionNote: note } : {}),
					...(adminUserId
						? {
								resolvedBy: new mongoose.Types.ObjectId(
									adminUserId,
								),
							}
						: {}),
					...(resolvedAt ? { resolvedAt } : {}),
				},
			},
			{ session, returnDocument: "after" },
		);
		return res ? (res.toObject() as unknown as IOrderDispute) : null;
	} catch {
		return null;
	}
}

export * from "./types";
