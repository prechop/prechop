export interface IPushSubscriptionKeys {
	p256dh: string;
	auth: string;
}

export interface IPushSubscriptionCreateInput {
	userId: string;
	endpoint: string;
	keys: IPushSubscriptionKeys;
	userAgent?: string;
}

export interface IPushSubscription {
	_id: string;
	id?: string;
	userId: string;
	endpoint: string;
	keys: IPushSubscriptionKeys;
	userAgent?: string;
	createdAt: Date;
	updatedAt: Date;
}
