export interface INotificationCreateInput {
	userId: string;
	title: string;
	body: string;
	type: string;
	data?: Record<string, unknown>;
	isRead?: boolean;
}

export interface INotification {
	_id: string;
	id?: string;
	userId: string;
	title: string;
	body: string;
	type: string;
	data?: Record<string, unknown>;
	isRead: boolean;
	createdAt: Date;
	updatedAt: Date;
}
