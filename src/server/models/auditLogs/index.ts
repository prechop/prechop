import mongoose, { type ClientSession, type Model } from "mongoose";
import { MAX_LIMIT } from "../../constants";
import { databaseResponseTimeHistogram } from "../../metrics";
import { IOperationType } from "../utils";
import type { IAuditLog, IAuditLogCreateInput } from "./types";

const collectionName = "auditLogs";

const DEFAULT_LIMIT = 20;
const MAX_AUDIT_LIMIT = 100;

export type AuditLogModel = Model<any>;

const schema = new mongoose.Schema<any>(
	{
		userId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "users",
			required: false,
			index: true,
		},
		role: { type: String, required: false },
		action: { type: String, required: true },
		resourceType: { type: String, required: true },
		resourceId: { type: String, required: false },
		previousState: { type: mongoose.Schema.Types.Mixed, required: false },
		newState: { type: mongoose.Schema.Types.Mixed, required: false },
		ipAddress: { type: String, required: false },
		userAgent: { type: String, required: false },
	},
	{ timestamps: true },
);

schema.index({ resourceType: 1, resourceId: 1 });
schema.index({ createdAt: -1 });

schema.pre("aggregate", function () {
	this.pipeline().push({ $addFields: { id: { $toString: "$_id" } } });
	this.pipeline().push({ $project: { __v: 0 } });
});

export const AuditLog: AuditLogModel =
	(mongoose.models[collectionName] as AuditLogModel | undefined) ??
	mongoose.model<any>(collectionName, schema);

// ── Writes ────────────────────────────────────────────────────────────────

export async function createAuditLogDB({
	payload,
	session,
}: {
	payload: IAuditLogCreateInput;
	session?: ClientSession;
}): Promise<IAuditLog | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		const doc = await new AuditLog({
			userId: payload.userId
				? new mongoose.Types.ObjectId(payload.userId)
				: undefined,
			role: payload.role,
			action: payload.action,
			resourceType: payload.resourceType,
			resourceId: payload.resourceId,
			previousState: payload.previousState,
			newState: payload.newState,
			ipAddress: payload.ipAddress,
			userAgent: payload.userAgent,
		}).save({ session });
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createAuditLogDB",
			success: "true",
		});
		return doc.toObject() as unknown as IAuditLog;
	} catch {
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createAuditLogDB",
			success: "false",
		});
		return null;
	}
}

// ── Reads ─────────────────────────────────────────────────────────────────

/** Recent audit entries for actions a given user performed. */
export async function listAuditLogsByUserDB({
	userId,
	limit,
	offset,
	session,
}: {
	userId: string;
	limit?: number;
	offset?: number;
	session?: ClientSession;
}): Promise<IAuditLog[]> {
	if (!mongoose.Types.ObjectId.isValid(userId)) return [];
	return listAuditLogsDB({
		filter: { userId: new mongoose.Types.ObjectId(userId) },
		limit,
		offset,
		session,
	});
}

export async function listAuditLogsDB({
	filter,
	limit,
	offset,
	session,
}: {
	filter?: Record<string, unknown>;
	limit?: number;
	offset?: number;
	session?: ClientSession;
} = {}): Promise<IAuditLog[]> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		const safeLimit = Math.min(
			Math.max(1, limit ?? DEFAULT_LIMIT),
			MAX_AUDIT_LIMIT,
		);
		const safeOffset = Math.max(0, offset ?? 0);
		const result = await AuditLog.aggregate<IAuditLog>(
			[
				{ $match: filter ?? {} },
				{ $sort: { createdAt: -1 } },
				{ $skip: safeOffset },
				{ $limit: safeLimit },
			],
			{ session },
		);
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "listAuditLogsDB",
			success: "true",
		});
		return result;
	} catch {
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "listAuditLogsDB",
			success: "false",
		});
		return [];
	}
}

export * from "./types";
export { MAX_LIMIT };
