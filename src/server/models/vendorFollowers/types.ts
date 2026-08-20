import type { Document, Types } from "mongoose";

export interface IVendorFollower {
	buyerId: Types.ObjectId;
	vendorId: Types.ObjectId;
	createdAt?: Date;
}

export interface IVendorFollowerDocument extends IVendorFollower, Document {
	_id: Types.ObjectId;
}
