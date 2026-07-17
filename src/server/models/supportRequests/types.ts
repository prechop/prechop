export type SupportAudience = "BUYER" | "VENDOR" | "ADMIN";
export type SupportStatus = "OPEN" | "PENDING_USER" | "RESOLVED" | "CLOSED";
export type SupportCategory =
	| "ORDER"
	| "PAYMENT"
	| "REFUND"
	| "VENDOR_ACCOUNT"
	| "MENU"
	| "SETTLEMENT"
	| "TECHNICAL"
	| "OTHER";

export interface ISupportMessage {
	id?: string;
	senderId: string;
	senderRole: SupportAudience;
	body: string;
	createdAt: Date;
}

export interface ISupportRequestCreateInput {
	userId: string;
	senderRole: SupportAudience;
	category: SupportCategory;
	subject: string;
	message: string;
	relatedOrderRef?: string;
	relatedPaymentRef?: string;
}

export interface ISupportRequest {
	_id: string;
	id?: string;
	userId: string;
	senderRole: SupportAudience;
	category: SupportCategory;
	subject: string;
	status: SupportStatus;
	assignedAdminId?: string;
	relatedOrderRef?: string;
	relatedPaymentRef?: string;
	messages: ISupportMessage[];
	createdAt: Date;
	updatedAt: Date;
}
