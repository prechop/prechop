import mongoose, { type ClientSession, type Model } from "mongoose";
import { assertPayoutV2FoundationEnabled } from "../../constants";
import {
	type IVendorTransferRecipient,
	type IVendorTransferRecipientCreateInput,
	VENDOR_TRANSFER_RECIPIENT_STATUSES,
} from "./types";

const collectionName = "vendorTransferRecipients";
export type VendorTransferRecipientModel = Model<any>;

const auditEntrySchema = new mongoose.Schema(
	{
		at: { type: Date, required: true },
		action: {
			type: String,
			enum: ["CREATED", "VERIFIED", "ACTIVATED", "RETIRED"],
			required: true,
		},
		actorId: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
		note: { type: String },
	},
	{ _id: false },
);

const schema = new mongoose.Schema<any>(
	{
		vendorId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "vendorProfiles",
			required: true,
			index: true,
			immutable: true,
		},
		version: {
			type: Number,
			required: true,
			min: 1,
			validate: Number.isSafeInteger,
			immutable: true,
		},
		paystackRecipientCode: {
			type: String,
			required: true,
			unique: true,
			immutable: true,
		},
		bankCode: { type: String, required: true, immutable: true },
		bankName: { type: String, required: true, immutable: true },
		accountName: { type: String, required: true, immutable: true },
		accountNumberEncrypted: {
			type: String,
			required: true,
			select: false,
			immutable: true,
		},
		accountNumberLast4: {
			type: String,
			required: true,
			match: /^\d{4}$/,
			immutable: true,
		},
		verifiedAt: { type: Date, required: true, immutable: true },
		verifiedBy: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "users",
			immutable: true,
		},
		status: {
			type: String,
			enum: VENDOR_TRANSFER_RECIPIENT_STATUSES,
			default: "ACTIVE",
			index: true,
		},
		retiredAt: { type: Date },
		retiredBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
		idempotencyKey: {
			type: String,
			required: true,
			unique: true,
			immutable: true,
		},
		auditHistory: { type: [auditEntrySchema], default: [] },
	},
	{ timestamps: true },
);

schema.index({ vendorId: 1, version: 1 }, { unique: true });
schema.index(
	{ vendorId: 1, status: 1 },
	{ unique: true, partialFilterExpression: { status: "ACTIVE" } },
);

schema.pre("aggregate", function () {
	this.pipeline().push({ $addFields: { id: { $toString: "$_id" } } });
	this.pipeline().push({
		$project: { accountNumberEncrypted: 0, __v: 0 },
	});
});

export const VendorTransferRecipient: VendorTransferRecipientModel =
	(mongoose.models[collectionName] as
		| VendorTransferRecipientModel
		| undefined) ?? mongoose.model<any>(collectionName, schema);

export type ICreateVendorTransferRecipientResult = IVendorTransferRecipient & {
	created: boolean;
};

export async function getActiveVendorTransferRecipientDB({
	vendorId,
}: {
	vendorId: string;
}): Promise<IVendorTransferRecipient | null> {
	if (!mongoose.Types.ObjectId.isValid(vendorId)) return null;
	const doc = await VendorTransferRecipient.findOne({
		vendorId: new mongoose.Types.ObjectId(vendorId),
		status: "ACTIVE",
	});
	return doc?.toObject() as unknown as IVendorTransferRecipient | null;
}

export async function getNextVendorTransferRecipientVersionDB({
	vendorId,
}: {
	vendorId: string;
}): Promise<number> {
	const latest = await VendorTransferRecipient.findOne({
		vendorId: new mongoose.Types.ObjectId(vendorId),
	}).sort({ version: -1 });
	return (latest?.version ?? 0) + 1;
}

export async function retireActiveVendorTransferRecipientDB(input: {
	vendorId: string;
	actorId?: string;
	note: string;
}): Promise<IVendorTransferRecipient | null> {
	const now = new Date();
	const doc = await VendorTransferRecipient.findOneAndUpdate(
		{
			vendorId: new mongoose.Types.ObjectId(input.vendorId),
			status: "ACTIVE",
		},
		{
			$set: {
				status: "RETIRED",
				retiredAt: now,
				...(input.actorId
					? { retiredBy: new mongoose.Types.ObjectId(input.actorId) }
					: {}),
			},
			$push: {
				auditHistory: {
					at: now,
					action: "RETIRED",
					...(input.actorId
						? {
								actorId: new mongoose.Types.ObjectId(
									input.actorId,
								),
							}
						: {}),
					note: input.note,
				},
			},
		},
		{ returnDocument: "after" },
	);
	return doc?.toObject() as unknown as IVendorTransferRecipient | null;
}

/** Metadata-only persistence. It never calls Paystack or creates a recipient. */
export async function createVendorTransferRecipientRecordOnceDB({
	payload,
	session,
}: {
	payload: IVendorTransferRecipientCreateInput;
	session?: ClientSession;
}): Promise<ICreateVendorTransferRecipientResult | null> {
	assertPayoutV2FoundationEnabled();
	try {
		const result = await VendorTransferRecipient.findOneAndUpdate(
			{ idempotencyKey: payload.idempotencyKey },
			{
				$setOnInsert: {
					...payload,
					vendorId: new mongoose.Types.ObjectId(payload.vendorId),
					...(payload.verifiedBy
						? {
								verifiedBy: new mongoose.Types.ObjectId(
									payload.verifiedBy,
								),
							}
						: {}),
					status: "ACTIVE",
					auditHistory: [
						{
							at: payload.verifiedAt,
							action: "VERIFIED",
							...(payload.verifiedBy
								? {
										actorId: new mongoose.Types.ObjectId(
											payload.verifiedBy,
										),
									}
								: {}),
						},
					],
				},
			},
			{
				session,
				upsert: true,
				returnDocument: "after",
				setDefaultsOnInsert: true,
				includeResultMetadata: true,
				runValidators: true,
			},
		);
		const doc = result?.value;
		if (!doc) return null;
		const recipient = (typeof doc.toObject === "function"
			? doc.toObject()
			: doc) as unknown as IVendorTransferRecipient;
		return {
			...recipient,
			created: result.lastErrorObject?.updatedExisting !== true,
		};
	} catch {
		return null;
	}
}

export * from "./types";
