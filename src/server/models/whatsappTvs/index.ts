import mongoose, { type ClientSession, type Model } from "mongoose";
import { ErrResourceNotFound, encrypt, validationError } from "../../constants";
import { databaseResponseTimeHistogram } from "../../metrics";
import { IOperationType } from "../utils";
import type { IWhatsappTv, IWhatsappTvCreateInput } from "./types";

const collectionName = "whatsappTvs";

export type WhatsappTvModel = Model<any>;

const schema = new mongoose.Schema<any>(
	{
		campusId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "campuses",
			required: true,
			index: true,
		},
		name: { type: String, required: true },
		// Encrypted at rest; store `encrypt(plaintext)` only.
		whatsappNumber: { type: String, required: true },
		audienceSize: { type: Number, default: 0 },
		priceRange: { type: String, required: false },
		// Soft-delete flag: TVs are deactivated, never hard-deleted.
		isActive: { type: Boolean, default: true },
		displayOrder: { type: Number, default: 0 },
	},
	{ timestamps: true },
);

// Campus listing hot path (active TVs for a campus).
schema.index({ campusId: 1, isActive: 1 });

schema.pre("aggregate", function () {
	this.pipeline().push({ $addFields: { id: { $toString: "$_id" } } });
	this.pipeline().push({ $project: { __v: 0 } });
});

export const WhatsappTv: WhatsappTvModel =
	(mongoose.models[collectionName] as WhatsappTvModel | undefined) ??
	mongoose.model<any>(collectionName, schema);

/**
 * Normalize + validate a Nigerian WhatsApp number. Strips a leading `+`, then
 * asserts the `234[789]XXXXXXXXX` shape. Throws `validationError` on a bad
 * number so callers surface a 400 rather than persisting garbage ciphertext.
 */
function normalizeWhatsappNumber(raw: string): string {
	const normalized = raw.trim().replace(/^\+/, "");
	if (!/^234[789]\d{9}$/.test(normalized)) {
		throw validationError(
			"Invalid WhatsApp number. Expected a Nigerian number like 2348012345678.",
		);
	}
	return normalized;
}

// ── Writes ────────────────────────────────────────────────────────────────

export async function createWhatsappTvDB({
	campusId,
	name,
	whatsappNumber,
	audienceSize,
	priceRange,
	displayOrder,
	session,
}: {
	campusId: string;
	name: string;
	whatsappNumber: string;
	audienceSize?: number;
	priceRange?: string;
	displayOrder?: number;
	session?: ClientSession;
}): Promise<IWhatsappTv | null> {
	// Validate BEFORE the timer/try so an invalid number throws to the caller
	// instead of being swallowed into a null return.
	const encryptedNumber = encrypt(normalizeWhatsappNumber(whatsappNumber));
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		const doc = await new WhatsappTv({
			campusId,
			name,
			whatsappNumber: encryptedNumber,
			audienceSize: audienceSize ?? 0,
			priceRange,
			displayOrder: displayOrder ?? 0,
		}).save({ session });
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createWhatsappTvDB",
			success: "true",
		});
		return doc.toObject() as unknown as IWhatsappTv;
	} catch {
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createWhatsappTvDB",
			success: "false",
		});
		return null;
	}
}

export async function updateWhatsappTvDB({
	id,
	payload,
	session,
}: {
	id: string;
	payload: Partial<IWhatsappTvCreateInput>;
	session?: ClientSession;
}): Promise<IWhatsappTv | null> {
	// Normalize + encrypt an incoming number BEFORE the try so an invalid one
	// throws to the caller.
	const update: Record<string, unknown> = { ...payload };
	if (typeof update.whatsappNumber === "string" && update.whatsappNumber) {
		update.whatsappNumber = encrypt(
			normalizeWhatsappNumber(update.whatsappNumber),
		);
	}
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		if (!mongoose.Types.ObjectId.isValid(id)) return null;
		const res = await WhatsappTv.findByIdAndUpdate(
			new mongoose.Types.ObjectId(id),
			{ $set: update },
			{ session, returnDocument: "after" },
		).lean<IWhatsappTv>();
		if (!res) throw ErrResourceNotFound;
		timer({
			operation: IOperationType.Update,
			collection: collectionName,
			method: "updateWhatsappTvDB",
			success: "true",
		});
		return { ...res, id: res._id.toString() } as IWhatsappTv;
	} catch {
		timer({
			operation: IOperationType.Update,
			collection: collectionName,
			method: "updateWhatsappTvDB",
			success: "false",
		});
		return null;
	}
}

export async function deactivateWhatsappTvDB({
	id,
	session,
}: {
	id: string;
	session?: ClientSession;
}): Promise<boolean> {
	try {
		if (!mongoose.Types.ObjectId.isValid(id)) return false;
		const res = await WhatsappTv.findByIdAndUpdate(
			new mongoose.Types.ObjectId(id),
			{ $set: { isActive: false } },
			{ session, returnDocument: "after" },
		);
		return !!res;
	} catch {
		return false;
	}
}

// ── Reads ─────────────────────────────────────────────────────────────────

export async function listWhatsappTvsByCampusDB({
	campusId,
	activeOnly,
	session,
}: {
	campusId: string;
	activeOnly?: boolean;
	session?: ClientSession;
}): Promise<IWhatsappTv[]> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		if (!mongoose.Types.ObjectId.isValid(campusId)) return [];
		const match: Record<string, unknown> = {
			campusId: new mongoose.Types.ObjectId(campusId),
		};
		if (activeOnly) match.isActive = true;
		const result = await WhatsappTv.aggregate<IWhatsappTv>(
			[{ $match: match }, { $sort: { displayOrder: 1 } }],
			{ session },
		);
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "listWhatsappTvsByCampusDB",
			success: "true",
		});
		return result;
	} catch {
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "listWhatsappTvsByCampusDB",
			success: "false",
		});
		return [];
	}
}

export * from "./types";
