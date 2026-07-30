import type { OrderStatus } from "../enums";

export type OrderConversationSenderRole = "BUYER" | "VENDOR" | "ADMIN";
export type OrderConversationParticipantRole = "buyer" | "vendor";

export interface IOrderConversationMessage {
	id?: string;
	clientMessageId?: string;
	senderId: string;
	senderRole: OrderConversationSenderRole;
	body: string;
	createdAt: Date;
}

export interface IOrderConversationCreateInput {
	buyerOrderId: string;
	buyerId: string;
	vendorId: string;
	vendorUserId: string;
	orderStatus: OrderStatus;
}

export interface IOrderConversation {
	_id: string;
	id?: string;
	buyerOrderId: string;
	buyerId: string;
	vendorId: string;
	vendorUserId: string;
	orderStatus: OrderStatus;
	messages: IOrderConversationMessage[];
	buyerLastReadAt?: Date;
	vendorLastReadAt?: Date;
	lastMessageAt?: Date;
	lastMessagePreview?: string;
	closedAt?: Date;
	createdAt: Date;
	updatedAt: Date;
}
