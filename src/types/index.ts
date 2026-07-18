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
	campusIds?: string[];
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
	defaultDeliveryCoverage?: string;
	defaultDeliveryEstimateMinutes?: number;
	defaultDeliveryContactPhone?: string;
	defaultDeliveryResponsibilityAccepted?: boolean;
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
	maxPlate: any;
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
	deliveryCoverage?: string;
	deliveryEstimateMinutes?: number;
	deliveryContactPhone?: string;
	deliveryResponsibilityAccepted?: boolean;
	totalOrdersCount: number;
	items: DailyOrderItem[];
	/** True on the public listing response when the signed-in caller owns it. */
	isOwnListing?: boolean;
	/** On the public listing response: is the vendor currently accepting orders? */
	vendorOpen?: boolean;
	/** On the public listing response: the shop's display name (may be null). */
	vendorName?: string | null;
	/** On the public listing response: where pickup buyers should collect from. */
	vendorPickupLocation?: string | null;
	/** On the public listing response: vendor contact for pickup coordination. */
	vendorPhone?: string | null;
	/**
	 * On public listing/marketplace responses: the shop's publishable rating, or
	 * null when it has fewer than 5 reviews (trust gate, PRD §8.12). Render
	 * "New kitchen" — never coerce null to 0, which shows as a 0-star shop.
	 */
	vendorRating?: number | null;
	/** On public listing/marketplace responses: how many reviews back the rating. */
	vendorTotalReviews?: number;
}

export interface PublicVendor {
	id: string;
	businessName: string | null;
	description: string | null;
	profileImageUrl: string | null;
	campusId: string;
	state: string | null;
	areaOrAddress: string | null;
	categories: string[];
	/**
	 * The shop's publishable average rating, or null when it has fewer than 5
	 * reviews (trust gate, PRD §8.12) — a single 5-star review must not render
	 * as a public "5.0". Nulled server-side, so the number is not merely hidden
	 * but absent from the response.
	 *
	 * Render as "New kitchen" / "Not enough reviews yet". Do NOT `?? 0` this:
	 * an unrated shop is not a zero-star shop.
	 */
	rating: number | null;
	totalReviews: number;
	totalOrders: number;
	isOpenForOrders: boolean;
}

export interface VendorStorefront {
	vendor: PublicVendor;
	listings: DailyOrder[];
	menu: MenuItem[];
}

export interface MarketplaceVendor {
	vendor: PublicVendor;
	listings: DailyOrder[];
}

export interface VendorSearchHit {
	vendor: PublicVendor;
	listings: DailyOrder[];
	matchedOn: string[];
}

export interface AdminUserDetail {
	user: {
		id: string;
		firstName: string;
		lastName: string;
		phone: string | null;
		campusId: string;
		campusName: string | null;
		campusState: string | null;
		isActive: boolean;
		isPhoneVerified: boolean;
		lastLoginAt: string | null;
		activeSessions: number;
		createdAt: string;
		updatedAt: string;
	};
	access: {
		groups: string[];
		roles: string[];
		actionCount: number;
		directPolicyCount: number;
	};
	vendor: null | {
		id: string;
		businessName: string | null;
		status: string;
		rating: number;
		totalReviews: number;
		totalOrders: number;
		completionRate: number;
		isOpenForOrders: boolean;
		reviewsReceived: { avg: number; count: number };
	};
	orders: {
		total: number;
		byStatus: Record<string, number>;
		totalSpentKobo: number;
		recent: Array<{
			id: string;
			orderNumber: string;
			status: string;
			totalKobo: number;
			createdAt: string;
		}>;
	};
	reviewsWritten: {
		count: number;
		recent: Array<{
			id: string;
			vendorId: string;
			rating: number;
			comment: string | null;
			createdAt: string;
		}>;
	};
	notifications: {
		unread: number;
		recent: Array<{
			id: string;
			title: string;
			body: string;
			isRead: boolean;
			createdAt: string;
		}>;
	};
	activity: {
		recent: Array<{
			id?: string;
			action: string;
			resourceType: string;
			ipAddress: string | null;
			createdAt: string;
		}>;
	};
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
	| "AWAITING_EXTERNAL_PAYMENT"
	| "PAID"
	| "CONFIRMED"
	| "PREPARING"
	| "READY"
	| "COMPLETED"
	| "CANCELLED"
	| "REFUNDED";

/** Lifecycle of the downloadable PDF receipt. Mirrors the server enum. */
export type ReceiptStatus = "PENDING" | "READY" | "FAILED";

export interface BuyerOrder {
	id: string;
	orderNumber: string;
	dailyOrderId: string;
	vendorId: string;
	buyerId: string;
	status: OrderStatus;
	fulfillmentType: "PICKUP" | "DELIVERY";
	/** Served on order detail responses so pickup buyers know where to collect. */
	vendorPickupLocation?: string | null;
	deliveryPhone?: string;
	customerMessage?: string;
	subtotalKobo: number;
	deliveryFeeKobo: number;
	platformFeeKobo: number;
	paymentProcessingFeeKobo?: number;
	prechopCommissionKobo?: number;
	vendorFoodAmountKobo?: number;
	vendorDeliveryAmountKobo?: number;
	vendorSettlementKobo?: number;
	totalKobo: number;
	externalPaymentUrl?: string;
	externalPaymentExpiresAt?: string;
	/**
	 * PDF receipt state, served on `GET /api/orders/{id}`.
	 *
	 * Null/absent means the order predates the feature — `ReceiptCard` renders
	 * nothing, which is correct: there is no receipt and none is coming.
	 *
	 * Note this is not `receiptUrl`. That field is the "Pay for Me" public
	 * `/receipt/{token}` link and is deliberately never exposed here.
	 */
	receiptStatus?: ReceiptStatus | null;
	items: BuyerOrderItem[];
	createdAt: string;
}

/**
 * `GET /api/site-configs/marketplace` — public, unauthenticated.
 *
 * Carries the marketplace kill switch and the live fee policy. The fee fields
 * are the admin's siteConfigs values resolved server-side through the same guard
 * `placeOrder` charges with, so a fee quoted from this payload cannot drift from
 * the fee taken at payment.
 *
 * Client code must render these values and never recompute a fee from the
 * `PLATFORM_FEE_*` env constants: those have no `NEXT_PUBLIC_` prefix, so in the
 * browser bundle they read as `undefined` and silently collapse to the hardcoded
 * 3%/₦200 fallback regardless of what the server charges. Adding the prefix does
 * not fix it either — it bakes a build-time value in and still ignores the
 * admin's config.
 */
export interface PublicSiteConfig {
	/** When false, buyers cannot browse or order; every buyer surface degrades. */
	marketplaceEnabled: boolean;
	/** Buyer service fee, percent of food subtotal (e.g. 3 = 3%). */
	platformFeeBuyerPercent: number;
	/** Hard cap on the buyer service fee, in kobo (e.g. 20000 = ₦200). */
	platformFeeBuyerMaxKobo: number;
	/** Vendor commission deducted from the food subtotal, percent (e.g. 8 = 8%). */
	platformFeeVendorPercent: number;
}

export type EarningsRange = "today" | "week" | "month" | "all";

export interface VendorEarningsDay {
	/** Lagos calendar day, `YYYY-MM-DD`. */
	date: string;
	orders: number;
	grossKobo: number;
	platformFeeKobo: number;
	netSettledKobo: number;
}

/**
 * `GET /api/vendors/me/earnings`. Derived from settled payments, so
 * `netSettledKobo` is what Paystack actually split to the vendor — not gross
 * revenue with the platform fee still in it.
 *
 * There is deliberately no `pendingBalanceKobo` or `nextSettlementDate`:
 * Paystack subaccount splits pay the vendor directly and PreChop never holds
 * the funds, so neither value exists to report.
 */
export interface VendorEarnings {
	/** False until the vendor connects a payout subaccount; nothing can settle. */
	bankConnected: boolean;
	/**
	 * The commission rate that will actually be charged on the vendor's next
	 * order, percent of food subtotal (e.g. 8 = 8%). Resolved from the admin's
	 * siteConfigs through the same guard `placeOrder` charges with.
	 *
	 * The retired flat `platformFeeVendorKobo` field is gone: it was always 0,
	 * and rendering it told every vendor their fee was "₦0.00 per order".
	 */
	platformFeeVendorPercent: number;
	totals: {
		grossKobo: number;
		platformFeeKobo: number;
		netSettledKobo: number;
		orders: number;
	};
	days: VendorEarningsDay[];
}

export type ReorderOutcome =
	| "ALL_AVAILABLE"
	| "PARTIAL"
	| "PRICE_CHANGED"
	| "NO_LISTING"
	| "NOT_STARTED"
	| "LISTING_CLOSED"
	| "VENDOR_CLOSED"
	| "VENDOR_GONE";

export interface ReorderPreviewItem {
	snapshotName: string;
	quantity: number;
	status: "AVAILABLE" | "SOLD_OUT" | "REMOVED";
	/** Today's listing item to add to cart. Absent when SOLD_OUT/REMOVED. */
	dailyOrderItemId?: string;
	previousPriceKobo: number;
	/** Today's price. Absent when the item is no longer listed. */
	currentPriceKobo?: number;
	/** Option ids remapped onto today's regenerated option groups. */
	selectedOptionIds?: string[];
	/** Options from the old order that no longer exist, named for the UI. */
	droppedOptionNames?: string[];
}

/**
 * `POST /api/orders/{id}/reorder-preview` — "Order Again".
 *
 * Exactly one `outcome`. The server owns the menuItemId → today's
 * dailyOrderItemId mapping and the option remap, because option ids are
 * regenerated per listing and the wire `BuyerOrderItem` never exposes
 * `menuItemId` — a client physically cannot do this.
 */
export interface ReorderPreview {
	outcome: ReorderOutcome;
	vendor: { id: string; businessName: string | null };
	/** The listing to reorder into. Absent unless there is one to order from. */
	target?: {
		dailyOrderId: string;
		shareableToken: string;
		availableFrom?: string;
		cutoffTime: string;
	};
	/** When NOT_STARTED/NO_LISTING: the next date the vendor is cooking. */
	nextListingDate?: string;
	items: ReorderPreviewItem[];
}

export interface AppNotification {
	id: string;
	title: string;
	body: string;
	type: string;
	isRead: boolean;
	createdAt: string;
}
