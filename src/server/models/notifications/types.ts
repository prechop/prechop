export interface INotificationCreateInput {
	userId: string;
	title: string;
	body: string;
	type: string;
	dedupeKey?: string;
	data?: Record<string, unknown>;
	isRead?: boolean;
}

export interface INotificationDeliveryAttempt {
	channel: "email" | "push" | "sms";
	status: "sent" | "skipped" | "failed";
	attemptedAt: Date;
	message?: string;
}

export interface INotification {
	_id: string;
	id?: string;
	userId: string;
	title: string;
	body: string;
	type: string;
	dedupeKey?: string;
	data?: Record<string, unknown>;
	deliveryAttempts?: INotificationDeliveryAttempt[];
	wasCreated?: boolean;
	isRead: boolean;
	createdAt: Date;
	updatedAt: Date;
}
