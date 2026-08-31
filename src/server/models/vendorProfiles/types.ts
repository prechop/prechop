import type {
	BakeryBusinessType,
	BrandKitFulfillmentStatus,
	BrandKitPaymentStatus,
	DeliveryCoverageType,
	LocationType,
	MenuCategory,
	VendorStatus,
	VendorType,
	VendorVerificationDocumentType,
} from "../enums";

export interface IVendorProfileCreateInput {
	userId: string;
	campusId?: string;
	email: string;
	businessName?: string;
	storeSlug?: string;
	vendorType?: VendorType;
	contactPhone?: string;
	vendorShortId?: string;
}

export interface IVendorProfile {
	_id: string;
	id?: string;
	userId: string;
	campusId?: string;
	campusIds?: string[];
	vendorType?: VendorType;
	bakeryBusinessType?: BakeryBusinessType;
	businessName?: string;
	storeSlug?: string;
	description?: string;
	email: string;
	contactPhone?: string;
	status: VendorStatus;
	locationType?: LocationType;
	schoolId?: string;
	schoolNameOther?: string;
	hostelOrStallName?: string;
	state?: string;
	areaOrAddress?: string;
	profileImageUrl?: string;
	verificationDocuments?: {
		type: VendorVerificationDocumentType;
		key: string;
		fileName?: string;
		mimeType?: string;
		uploadedAt: Date;
	}[];
	categories: MenuCategory[];
	paystackSubaccountCode?: string;
	bankCode?: string;
	bankName?: string;
	// AES-256-GCM ciphertext; decrypt only for payout/config display to owner.
	accountNumber?: string;
	accountName?: string;
	rating: number;
	totalReviews: number;
	totalOrders: number;
	completionRate: number;
	completedOrders: number;
	lateOrderCount?: number;
	unfulfilledOrderCount?: number;
	avgPrepDelayMin?: number;
	profileCompleteness: number;
	isOpenForOrders: boolean;
	closedAt?: Date;
	// Vendor notification preferences (email/push opt-ins).
	notifyNewOrders: boolean;
	notifyPayouts: boolean;
	notifyReviews: boolean;
	notifyFollowers: boolean;
	notifyFollowerMilestones: boolean;
	// Defaults pre-filled into the daily-order composer.
	defaultPickupAvailable: boolean;
	defaultDeliveryAvailable: boolean;
	defaultDeliveryFeeKobo: number;
	defaultDeliveryCoverage?: string;
	defaultDeliveryEstimateMinutes?: number;
	defaultDeliveryContactPhone?: string;
	defaultDeliveryResponsibilityAccepted?: boolean;
	// Onboarding review trail
	submittedAt?: Date;
	reviewedAt?: Date;
	reviewedBy?: string;
	rejectionReason?: string;
	reviewNotes?: string;
	// Post-approval security onboarding.
	securityOnboardingDismissedAt?: Date;
	securityOnboardingCompletedAt?: Date;
	securityPinHash?: string;
	securityPinSet?: boolean;
	pinResetHoldUntil?: Date;
	lastPinResetAt?: Date;
	deleted: boolean;
	createdAt: Date;
	updatedAt: Date;
	// Permanent short vendor ID (e.g. "CHI").
	vendorShortId?: string;
	// Brand Kit payment gate.
	brandKitPaymentStatus?: BrandKitPaymentStatus;
	brandKitPaymentId?: string;
	brandKitPaidAt?: Date;
	// Brand Kit fulfillment gate.
	brandKitFulfillmentStatus?: BrandKitFulfillmentStatus;
	brandKitFulfillmentLocationId?: string;
	brandKitReceivedAt?: Date;
	// Vendor-level feature toggles.
	featureScheduleAhead?: boolean;
	featureWeeklyBreakfastPlan?: boolean;
	featureDelivery?: boolean;
	featurePickup?: boolean;
	breakfastEnabled?: boolean;
	lunchEnabled?: boolean;
	dinnerEnabled?: boolean;
	// Delivery coverage.
	deliveryCoverageType?: DeliveryCoverageType;
	deliveryLocations?: string[];
}
