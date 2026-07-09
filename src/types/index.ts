// Client-facing view-model types mirroring the API envelope `data` shapes.

export interface PublicUser {
	id: string;
	campusId: string;
	/** IAM group names the user belongs to (e.g. "Vendors", "Administrators"). */
	groups: string[];
	/** Resolved effective permission action strings, for UI gating. */
	permissions: string[];
	firstName: string;
	lastName: string;
	phone: string;
	isPhoneVerified: boolean;
	isActive: boolean;
	createdAt: string;
}

export interface Campus {
	id: string;
	name: string;
	shortCode: string;
	state: string;
}

export interface MenuItem {
	id: string;
	vendorId: string;
	category: string;
	name: string;
	description?: string;
	priceKobo: number;
	imageUrl?: string;
	estimatedPrepMin: number;
	isAvailable: boolean;
	isSoldOut: boolean;
	displayOrder: number;
	optionGroupIds: string[];
}

export interface MenuOption {
	id: string;
	name: string;
	priceKobo: number;
	displayOrder: number;
}

export interface MenuOptionGroup {
	id: string;
	vendorId: string;
	name: string;
	required: boolean;
	minSelect: number;
	maxSelect: number | null;
	displayOrder: number;
	options: MenuOption[];
}

export interface VendorProfile {
	id: string;
	userId: string;
	campusId: string;
	vendorType?: string;
	businessName?: string;
	description?: string;
	email: string;
	status:
		| "INCOMPLETE"
		| "PENDING_REVIEW"
		| "CHANGES_REQUESTED"
		| "ACTIVE"
		| "SUSPENDED";
	submittedAt?: string;
	reviewedAt?: string;
	rejectionReason?: string;
	locationType?: string;
	categories: string[];
	profileImageUrl?: string;
	rating: number;
	totalReviews: number;
	totalOrders: number;
	profileCompleteness: number;
	isOpenForOrders: boolean;
	paystackSubaccountCode?: string;
	notifyNewOrders?: boolean;
	notifyPayouts?: boolean;
	notifyReviews?: boolean;
	defaultPickupAvailable?: boolean;
	defaultDeliveryAvailable?: boolean;
	defaultDeliveryFeeKobo?: number;
}

export interface DailyOrderOption {
	id: string;
	name: string;
	priceKobo: number;
	displayOrder: number;
}

export interface DailyOrderOptionGroup {
	id: string;
	sourceGroupId?: string | null;
	name: string;
	required: boolean;
	minSelect: number;
	maxSelect: number | null;
	options: DailyOrderOption[];
}

export interface DailyOrderItem {
	id: string;
	menuItemId: string;
	snapshotName: string;
	snapshotPriceKobo: number;
	snapshotImageUrl?: string;
	snapshotPrepMin: number;
	maxQuantity?: number | null;
	orderedQuantity: number;
	optionGroups: DailyOrderOptionGroup[];
}

export interface DailyOrder {
	id: string;
	vendorId: string;
	campusId: string;
	shareableToken: string;
	title: string;
	scheduledDate: string;
	/** Ordering opens at this time; before it the listing is "coming soon". */
	availableFrom?: string;
	cutoffTime: string;
	status: "DRAFT" | "ACTIVE" | "CLOSED" | "CANCELLED";
	pickupAvailable: boolean;
	deliveryAvailable: boolean;
	deliveryFeeKobo: number;
	totalOrdersCount: number;
	items: DailyOrderItem[];
}

export interface BuyerOrderItem {
	dailyOrderItemId: string;
	snapshotName: string;
	snapshotPriceKobo: number;
	quantity: number;
	subtotalKobo: number;
	selectedOptions: Array<{
		groupName: string;
		snapshotName: string;
		quantity: number;
		subtotalKobo: number;
	}>;
}

export type OrderStatus =
	| "PENDING_PAYMENT"
	| "PAID"
	| "CONFIRMED"
	| "PREPARING"
	| "READY"
	| "COMPLETED"
	| "CANCELLED"
	| "REFUNDED";

export interface BuyerOrder {
	id: string;
	orderNumber: string;
	dailyOrderId: string;
	vendorId: string;
	buyerId: string;
	status: OrderStatus;
	fulfillmentType: "PICKUP" | "DELIVERY";
	subtotalKobo: number;
	deliveryFeeKobo: number;
	platformFeeKobo: number;
	totalKobo: number;
	items: BuyerOrderItem[];
	createdAt: string;
}

export interface AppNotification {
	id: string;
	title: string;
	body: string;
	type: string;
	isRead: boolean;
	createdAt: string;
}
