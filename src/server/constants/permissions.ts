/**
 * IAM action catalog.
 *
 * Actions are `resource:verb` strings (optionally deeper, e.g. `iam:user:read`).
 * Policies reference these; the admin policy editor renders the catalog grouped
 * by resource. `*` and `resource:*` wildcards are honoured by the policy engine.
 *
 * This is the single source of truth — the engine matches against these values
 * and the UI picks from them, so adding a capability means adding it here.
 */

export const PERMISSION_CATALOG = {
	vendor: {
		label: "Vendors",
		actions: {
			"vendor:read": "View vendor profiles",
			"vendor:update": "Edit vendor profiles",
			"vendor:suspend": "Suspend a vendor",
			"vendor:reactivate": "Reactivate a vendor",
		},
	},
	onboarding: {
		label: "Vendor onboarding",
		actions: {
			"onboarding:read": "View onboarding submissions",
			"onboarding:approve": "Approve a vendor submission",
			"onboarding:reject": "Reject a vendor submission",
		},
	},
	order: {
		label: "Orders",
		actions: {
			"order:read": "View orders",
			"order:cancel": "Cancel an order",
			"order:update": "Update order status",
		},
	},
	menu: {
		label: "Menu & catalog",
		actions: {
			"menu:read": "View menu items",
			"menu:manage": "Create / edit own menu items",
			"menu:takedown": "Take down any vendor's menu item",
		},
	},
	payment: {
		label: "Payments",
		actions: {
			"payment:read": "View payments",
			"refund:read": "View refunds",
			"refund:create": "Issue a refund",
		},
	},
	campus: {
		label: "Campuses",
		actions: {
			"campus:read": "View campuses",
			"campus:create": "Create a campus",
			"campus:update": "Edit a campus",
		},
	},
	school: {
		label: "Schools",
		actions: {
			"school:read": "View schools",
			"school:create": "Create a school",
			"school:update": "Edit a school",
		},
	},
	review: {
		label: "Reviews",
		actions: {
			"review:read": "View reviews",
			"review:moderate": "Flag / unflag reviews",
		},
	},
	whatsappTv: {
		label: "WhatsApp TVs",
		actions: {
			"whatsappTv:read": "View WhatsApp TVs",
			"whatsappTv:manage": "Create / edit / delete WhatsApp TVs",
		},
	},
	siteConfig: {
		label: "Site configuration",
		actions: {
			"siteConfig:read": "View site configuration",
			"siteConfig:update": "Edit site configuration",
		},
	},
	analytics: {
		label: "Analytics",
		actions: {
			"analytics:read": "View platform analytics",
		},
	},
	notification: {
		label: "Notifications",
		actions: {
			"notification:send": "Send / broadcast notifications",
		},
	},
	audit: {
		label: "Audit log",
		actions: {
			"audit:read": "View the audit log",
		},
	},
	iam: {
		label: "Access management (IAM)",
		actions: {
			"iam:user:read": "View users, their groups & policies",
			"iam:user:update": "Attach / detach groups & policies on a user",
			"iam:group:read": "View groups",
			"iam:group:manage": "Create / edit / delete groups",
			"iam:policy:read": "View policies",
			"iam:policy:manage": "Create / edit / delete policies",
		},
	},
	// Buyer-facing app capabilities (granted by the Buyers base policy).
	buyer: {
		label: "Buyer app",
		actions: {
			"buyer:order:create": "Place an order",
			"buyer:order:read": "View own orders",
			"buyer:review:create": "Leave a review",
		},
	},
	// Vendor-facing app capabilities (granted by the Vendors base policy).
	vendorApp: {
		label: "Vendor app",
		actions: {
			"vendorApp:manage": "Manage own vendor profile & onboarding",
			"vendorApp:dailyOrder:manage": "Create & run daily orders",
			"vendorApp:order:manage": "View & fulfil incoming orders",
			"vendorApp:analytics:read": "View own analytics",
		},
	},
} as const;

/** Flat list of every concrete action string in the catalog. */
export const ALL_ACTIONS: string[] = Object.values(PERMISSION_CATALOG).flatMap(
	(group) => Object.keys(group.actions),
);

export function isKnownAction(action: string): boolean {
	return ALL_ACTIONS.includes(action);
}

// ── Built-in policy statement sets ──────────────────────────────────────────
// Referenced by the IAM seed. Kept here so the catalog and the built-ins that
// depend on it stay in one place.

export interface PolicyStatementSeed {
	effect: "Allow" | "Deny";
	actions: string[];
	resources?: string[];
	condition?: Record<string, string>;
}

export const BUILTIN_POLICIES: Record<
	string,
	{ description: string; statements: PolicyStatementSeed[] }
> = {
	AdministratorFullAccess: {
		description: "Full, unrestricted access to every action.",
		statements: [{ effect: "Allow", actions: ["*"] }],
	},
	BuyerBaseAccess: {
		description: "Default capabilities for a buyer account.",
		statements: [
			{
				effect: "Allow",
				actions: [
					"buyer:order:create",
					"buyer:order:read",
					"buyer:review:create",
					"menu:read",
					"vendor:read",
					"review:read",
				],
			},
		],
	},
	VendorBaseAccess: {
		description: "Default capabilities for a vendor account.",
		statements: [
			{
				effect: "Allow",
				actions: [
					"vendorApp:manage",
					"vendorApp:dailyOrder:manage",
					"vendorApp:order:manage",
					"vendorApp:analytics:read",
					"menu:read",
					"menu:manage",
					"vendor:read",
					"review:read",
				],
			},
		],
	},
	VendorOnboardingManager: {
		description:
			"Review, approve and reject vendor onboarding submissions.",
		statements: [
			{
				effect: "Allow",
				actions: [
					"onboarding:read",
					"onboarding:approve",
					"onboarding:reject",
					"vendor:read",
					"audit:read",
				],
			},
		],
	},
	FinanceManager: {
		description: "View payments and issue refunds.",
		statements: [
			{
				effect: "Allow",
				actions: [
					"payment:read",
					"refund:read",
					"refund:create",
					"order:read",
					"vendor:read",
					"analytics:read",
				],
			},
		],
	},
	SupportAgent: {
		description: "Read-only support plus review moderation.",
		statements: [
			{
				effect: "Allow",
				actions: [
					"vendor:read",
					"order:read",
					"menu:read",
					"review:read",
					"review:moderate",
					"campus:read",
					"school:read",
				],
			},
		],
	},
} as const;

export const BUILTIN_GROUPS: Record<
	string,
	{ description: string; policies: string[] }
> = {
	Administrators: {
		description: "Full platform administrators.",
		policies: ["AdministratorFullAccess"],
	},
	Buyers: {
		description: "All buyer accounts.",
		policies: ["BuyerBaseAccess"],
	},
	Vendors: {
		description: "All vendor accounts.",
		policies: ["VendorBaseAccess"],
	},
	OnboardingReviewers: {
		description: "Staff who review vendor onboarding submissions.",
		policies: ["VendorOnboardingManager"],
	},
	Finance: {
		description: "Staff who manage payments and refunds.",
		policies: ["FinanceManager"],
	},
	Support: {
		description: "Support staff (read-only + review moderation).",
		policies: ["SupportAgent"],
	},
} as const;

export const ADMINISTRATORS_GROUP = "Administrators";
export const BUYERS_GROUP = "Buyers";
export const VENDORS_GROUP = "Vendors";
export const ADMIN_FULL_ACCESS_POLICY = "AdministratorFullAccess";
