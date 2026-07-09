/**
 * Idempotent development seed.
 *
 *   pnpm seed
 *
 * Populates: site configs, two campuses, a handful of schools, a super-admin
 * (SEED_ADMIN_PHONE), one fully-onboarded demo vendor with a menu and a live
 * daily order, and a demo buyer. Safe to re-run — everything keys off natural
 * identifiers (shortCode / phone / token) and is skipped if already present.
 *
 * OTP delivery in dev is console-mode, so you can log in with any seeded phone
 * and read the code from the server logs.
 */

import {
	ADMINISTRATORS_GROUP,
	BUYERS_GROUP,
	generateShareableToken,
	nairaToKobo,
	PAYSTACK_SECRET_KEY,
	SEED_ADMIN_PHONE,
	VENDORS_GROUP,
} from "../src/server/constants";
import {
	connectMongoDB,
	disconnectMongoDB,
} from "../src/server/databases/mongoDB";
import {
	addUserToGroupDB,
	createCampusDB,
	createDailyOrderDB,
	createMenuItemDB,
	createOptionGroupDB,
	createSchoolDB,
	createUserDB,
	createVendorProfileDB,
	DailyOrderStatus,
	getCampusByShortCodeDB,
	getSiteConfigsDocDB,
	getUserByPhoneDB,
	getVendorProfileByUserIdDB,
	LocationType,
	MenuCategory,
	setDailyOrderStatusDB,
	updateVendorProfileDB,
	upsertSiteConfigsDB,
	VendorStatus,
	VendorType,
} from "../src/server/models";
import { paystackProvider } from "../src/server/providers";
import { getBuiltInGroupId, seedBuiltInIam } from "../src/server/services/iam";

function log(msg: string): void {
	process.stdout.write(`  ${msg}\n`);
}

/** Freeze a library option group into a daily-order-item snapshot shape. */
function snapshotGroup(g: {
	_id: { toString(): string };
	name: string;
	required: boolean;
	minSelect: number;
	maxSelect: number | null;
	options: Array<{ name: string; priceKobo: number }>;
}) {
	return {
		sourceGroupId: g._id.toString(),
		name: g.name,
		required: g.required,
		minSelect: g.minSelect,
		maxSelect: g.maxSelect,
		options: g.options.map((o, i) => ({
			name: o.name,
			priceKobo: o.priceKobo,
			displayOrder: i,
		})),
	};
}

/**
 * Best-effort real Paystack subaccount for a seeded vendor. When a Paystack
 * secret key is configured we create a real (test-mode) subaccount so the
 * checkout split works end-to-end; otherwise — or if the API call fails — we
 * fall back to a seed placeholder. `initializeTransaction` skips the split for
 * placeholder codes outside production, so local checkout still succeeds.
 */
async function resolveSeedSubaccount(input: {
	businessName: string;
	bankCode: string;
	accountNumber: string;
	fallbackCode: string;
}): Promise<string> {
	if (!PAYSTACK_SECRET_KEY) {
		log(`no PAYSTACK_SECRET_KEY — using placeholder ${input.fallbackCode}`);
		return input.fallbackCode;
	}
	try {
		const sub = await paystackProvider.createSubaccount({
			businessName: input.businessName,
			bankCode: input.bankCode,
			accountNumber: input.accountNumber,
		});
		log(`created Paystack subaccount ${sub.subaccount_code}`);
		return sub.subaccount_code;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		log(
			`Paystack subaccount creation failed (${message}) — using placeholder ${input.fallbackCode}`,
		);
		return input.fallbackCode;
	}
}

async function seedCampus(input: {
	name: string;
	shortCode: string;
	state: string;
}): Promise<{ _id: string }> {
	const existing = await getCampusByShortCodeDB({
		shortCode: input.shortCode,
	});
	if (existing) {
		log(`campus ${input.shortCode} exists`);
		return { _id: existing._id.toString() };
	}
	const created = await createCampusDB({ payload: input });
	if (!created) throw new Error(`failed to create campus ${input.shortCode}`);
	log(`campus ${input.shortCode} created`);
	return { _id: created._id.toString() };
}

async function ensureUser(input: {
	campusId: string;
	groupName: string;
	firstName: string;
	lastName: string;
	phone: string;
}): Promise<{ _id: string; created: boolean }> {
	const groupId = await getBuiltInGroupId(input.groupName);
	const existing = await getUserByPhoneDB({ phone: input.phone });
	if (existing) {
		// Backfill group membership on re-seed (e.g. after the IAM migration).
		if (groupId)
			await addUserToGroupDB({ id: existing._id.toString(), groupId });
		log(`user ${input.phone} (${input.groupName}) exists`);
		return { _id: existing._id.toString(), created: false };
	}
	const created = await createUserDB({
		payload: {
			campusId: input.campusId,
			firstName: input.firstName,
			lastName: input.lastName,
			phone: input.phone,
			groupIds: groupId ? [groupId] : [],
			isPhoneVerified: true,
			isActive: true,
		},
	});
	if (!created) throw new Error(`failed to create user ${input.phone}`);
	log(`user ${input.phone} (${input.groupName}) created`);
	return { _id: created._id.toString(), created: true };
}

async function main(): Promise<void> {
	process.stdout.write("\nSeeding Prechop…\n\n");
	await connectMongoDB();

	// ── IAM built-ins (policies + groups) ───────────────────────────────
	await seedBuiltInIam();
	log("IAM built-in policies & groups seeded");

	// ── Site configs ────────────────────────────────────────────────────
	const cfg = await getSiteConfigsDocDB();
	if (!cfg) {
		await upsertSiteConfigsDB({ payload: {}, updatedBy: "seed" });
		log("site configs initialised with defaults");
	} else {
		log("site configs exist");
	}

	// ── Campuses ────────────────────────────────────────────────────────
	const unilag = await seedCampus({
		name: "University of Lagos",
		shortCode: "UNILAG",
		state: "Lagos",
	});
	await seedCampus({
		name: "University of Ibadan",
		shortCode: "UI",
		state: "Oyo",
	});

	// ── Schools ─────────────────────────────────────────────────────────
	const schools = [
		{
			name: "University of Lagos",
			state: "Lagos",
			type: "University" as const,
		},
		{
			name: "University of Ibadan",
			state: "Oyo",
			type: "University" as const,
		},
		{
			name: "Yaba College of Technology",
			state: "Lagos",
			type: "Polytechnic" as const,
		},
	];
	for (const s of schools) {
		await createSchoolDB({ payload: s }).then((r) =>
			log(r ? `school ${s.name} created` : `school ${s.name} skipped`),
		);
	}

	// ── Super admin ─────────────────────────────────────────────────────
	await ensureUser({
		campusId: unilag._id,
		groupName: ADMINISTRATORS_GROUP,
		firstName: "Prechop",
		lastName: "Admin",
		phone: SEED_ADMIN_PHONE,
	});

	// ── Demo buyer ──────────────────────────────────────────────────────
	await ensureUser({
		campusId: unilag._id,
		groupName: BUYERS_GROUP,
		firstName: "Ada",
		lastName: "Obi",
		phone: "08111111111",
	});

	// ── Demo vendor awaiting review (populates the onboarding queue) ─────
	const pendingUser = await ensureUser({
		campusId: unilag._id,
		groupName: VENDORS_GROUP,
		firstName: "Chidi",
		lastName: "Nwosu",
		phone: "08133333333",
	});
	// Idempotent: create the profile on first run, and on every run reset it to
	// PENDING_REVIEW so the onboarding queue always has something to review.
	const existingPending = await getVendorProfileByUserIdDB({
		userId: pendingUser._id,
	});
	const pendingProfile =
		existingPending ??
		(await createVendorProfileDB({
			payload: {
				userId: pendingUser._id,
				campusId: unilag._id,
				email: "chidi@campusbites.ng",
				businessName: "Campus Bites",
				vendorType: VendorType.CAMPUS_STALL,
			},
		}));
	if (pendingProfile) {
		await updateVendorProfileDB({
			id: pendingProfile._id.toString(),
			payload: {
				status: VendorStatus.PENDING_REVIEW,
				locationType: LocationType.ON_CAMPUS,
				description: "Quick campus snacks and drinks.",
				categories: [MenuCategory.SNACKS, MenuCategory.DRINKS],
				profileImageUrl: "/seed/campus-bites.svg",
				profileCompleteness: 100,
				submittedAt: new Date(),
				paystackSubaccountCode: "ACCT_seedpending01",
				bankName: "GTBank",
				accountName: "Campus Bites",
				accountNumber: "0123456789",
			},
		});
		log("vendor 'Campus Bites' → PENDING_REVIEW");
	}

	// ── Demo vendor (fully onboarded) ───────────────────────────────────
	const vendorUser = await ensureUser({
		campusId: unilag._id,
		groupName: VENDORS_GROUP,
		firstName: "Tunde",
		lastName: "Bakare",
		phone: "08122222222",
	});

	let vendorId: string;
	const vendorProfile = await createVendorProfileDB({
		payload: {
			userId: vendorUser._id,
			campusId: unilag._id,
			email: "tunde@adaskitchen.ng",
			businessName: "Ada's Kitchen",
			vendorType: VendorType.STUDENT_COOK,
		},
	});
	if (vendorProfile) {
		vendorId = vendorProfile._id.toString();
		const demoSubaccountCode = await resolveSeedSubaccount({
			businessName: "Ada's Kitchen",
			bankCode: "044", // Access Bank
			accountNumber: "0690000031",
			// Placeholder used when no Paystack key is configured; the payment
			// provider skips the split for this code outside production.
			fallbackCode: "ACCT_seeddemo0001",
		});
		await updateVendorProfileDB({
			id: vendorId,
			payload: {
				status: VendorStatus.ACTIVE,
				locationType: LocationType.ON_CAMPUS,
				description:
					"Home-style Nigerian meals, cooked fresh to order.",
				categories: [MenuCategory.MEALS, MenuCategory.DRINKS],
				isOpenForOrders: true,
				profileImageUrl: "/seed/adas-kitchen.svg",
				profileCompleteness: 100,
				paystackSubaccountCode: demoSubaccountCode,
				bankCode: "044",
				bankName: "Access Bank",
				accountName: "Ada's Kitchen",
				accountNumber: "0690000031",
			},
		});
		log("vendor 'Ada's Kitchen' created + activated");
	} else {
		vendorId = "";
		log("vendor profile already exists (skipping menu/daily-order seed)");
	}

	// Only seed menu + listing when we freshly created the vendor profile.
	if (vendorProfile) {
		// ── Reusable option groups (the vendor's shared library) ────────
		const proteinGroup = await createOptionGroupDB({
			payload: {
				vendorId,
				campusId: unilag._id,
				name: "Protein",
				required: true,
				minSelect: 1,
				maxSelect: 1,
				displayOrder: 0,
				options: [
					{ name: "Grilled chicken", priceKobo: nairaToKobo(0) },
					{ name: "Beef", priceKobo: nairaToKobo(300) },
					{ name: "Fish", priceKobo: nairaToKobo(200) },
				],
			},
		});
		const extrasGroup = await createOptionGroupDB({
			payload: {
				vendorId,
				campusId: unilag._id,
				name: "Extras",
				required: false,
				minSelect: 0,
				maxSelect: 3,
				displayOrder: 1,
				options: [
					{ name: "Extra chicken", priceKobo: nairaToKobo(700) },
					{ name: "Plantain", priceKobo: nairaToKobo(500) },
					{ name: "Coleslaw", priceKobo: nairaToKobo(400) },
				],
			},
		});
		const mealGroupIds = [proteinGroup, extrasGroup]
			.filter((g): g is NonNullable<typeof g> => Boolean(g))
			.map((g) => g._id.toString());
		log(`${mealGroupIds.length} option groups created`);

		const menuSpecs = [
			{
				category: MenuCategory.MEALS,
				name: "Jollof Rice & Chicken",
				priceKobo: nairaToKobo(2500),
				estimatedPrepMin: 20,
				imageUrl: "/seed/jollof.svg",
			},
			{
				category: MenuCategory.MEALS,
				name: "Fried Rice & Turkey",
				priceKobo: nairaToKobo(3000),
				estimatedPrepMin: 25,
				imageUrl: "/seed/fried-rice.svg",
			},
			{
				category: MenuCategory.MEALS,
				name: "Amala & Ewedu",
				priceKobo: nairaToKobo(2000),
				estimatedPrepMin: 15,
				imageUrl: "/seed/amala.svg",
			},
			{
				category: MenuCategory.DRINKS,
				name: "Chapman",
				priceKobo: nairaToKobo(800),
				estimatedPrepMin: 5,
				imageUrl: "/seed/chapman.svg",
			},
		];
		const menuItems = [];
		for (let i = 0; i < menuSpecs.length; i += 1) {
			const created = await createMenuItemDB({
				payload: {
					vendorId,
					campusId: unilag._id,
					displayOrder: i,
					// Attach the shared option groups to meals so buyers can
					// customise them when ordering.
					optionGroupIds:
						menuSpecs[i].category === MenuCategory.MEALS
							? mealGroupIds
							: [],
					...menuSpecs[i],
				},
			});
			if (created) menuItems.push(created);
		}
		log(`${menuItems.length} menu items created`);

		// ── Live daily order (cutoff in 6h) ─────────────────────────────
		const cutoff = new Date(Date.now() + 6 * 60 * 60 * 1000);
		const scheduledDate = new Date();
		const daily = await createDailyOrderDB({
			payload: {
				vendorId,
				campusId: unilag._id,
				shareableToken: generateShareableToken(),
				title: "Today's Hot Lunch",
				scheduledDate,
				cutoffTime: cutoff,
				pickupAvailable: true,
				deliveryAvailable: true,
				deliveryFeeKobo: nairaToKobo(300),
				items: menuItems.map((m) => ({
					menuItemId: m._id.toString(),
					snapshotName: m.name,
					snapshotPriceKobo: m.priceKobo,
					snapshotImageUrl: m.imageUrl,
					snapshotPrepMin: m.estimatedPrepMin,
					maxQuantity: 25,
					// Snapshot the meal's attached option groups onto the listing
					// so buyers can pick Protein/Extras at checkout.
					optionGroups:
						m.category === MenuCategory.MEALS
							? [proteinGroup, extrasGroup]
									.filter((g): g is NonNullable<typeof g> =>
										Boolean(g),
									)
									.map(snapshotGroup)
							: [],
				})),
			},
		});
		if (daily) {
			await setDailyOrderStatusDB({
				id: daily._id.toString(),
				vendorId,
				status: DailyOrderStatus.ACTIVE,
				fromStatuses: [DailyOrderStatus.DRAFT],
			});
			log(
				`daily order live → /o/${daily.shareableToken} (cutoff ${cutoff.toLocaleTimeString()})`,
			);
		}
	}

	process.stdout.write("\n✓ Seed complete.\n");
	process.stdout.write(
		`\n  Admin login phone : ${SEED_ADMIN_PHONE}\n  Buyer login phone : 08111111111\n  Vendor login phone: 08122222222\n  (OTP prints to server logs in dev.)\n\n`,
	);

	await disconnectMongoDB();
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error("\nSeed failed:", err);
		process.exit(1);
	});
