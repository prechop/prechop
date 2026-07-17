import type {
	LocationType,
	MenuCategory,
	VendorStatus,
	VendorType,
} from "../enums";

export interface IVendorProfileCreateInput {
	userId: string;
	campusId: string;
	email: string;
	businessName?: string;
	vendorType?: VendorType;
}

export interface IVendorProfile {
	_id: string;
	id?: string;
	userId: string;
	campusId: string;
	campusIds?: string[];
	vendorType?: VendorType;
	businessName?: string;
	description?: string;
	email: string;
	status: VendorStatus;
	locationType?: LocationType;
	schoolId?: string;
	schoolNameOther?: string;
	hostelOrStallName?: string;
	state?: string;
	areaOrAddress?: string;
	profileImageUrl?: string;
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
	profileCompleteness: number;
	isOpenForOrders: boolean;
	// Vendor notification preferences (email/push opt-ins).
	notifyNewOrders: boolean;
	notifyPayouts: boolean;
	notifyReviews: boolean;
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
	deleted: boolean;
	createdAt: Date;
	updatedAt: Date;
}
