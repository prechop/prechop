// Client-facing view-model types mirroring the API envelope `data` shapes.

export type UserRole = "BUYER" | "VENDOR" | "SUPER_ADMIN";

export interface PublicUser {
	id: string;
	campusId: string;
	role: UserRole;
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
}

export interface VendorProfile {
	id: string;
	userId: string;
	campusId: string;
	vendorType?: string;
	businessName?: string;
	description?: string;
	email: string;
	status: "INCOMPLETE" | "ACTIVE" | "SUSPENDED";
	locationType?: string;
	categories: string[];
	profileImageUrl?: string;
	rating: number;
	totalReviews: number;
	totalOrders: number;
	profileCompleteness: number;
	isOpenForOrders: boolean;
	paystackSubaccountCode?: string;
}

export interface DailyOrderItemAddon {
	id: string;
	name: string;
	priceKobo: number;
	displayOrder: number;
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
	addons: DailyOrderItemAddon[];
}

export interface DailyOrder {
	id: string;
	vendorId: string;
	campusId: string;
	shareableToken: string;
	title: string;
	scheduledDate: string;
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
	addons: Array<{
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
