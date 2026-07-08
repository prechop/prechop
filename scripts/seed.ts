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
	generateShareableToken,
	nairaToKobo,
	SEED_ADMIN_PHONE,
} from "../src/server/constants";
import {
	connectMongoDB,
	disconnectMongoDB,
} from "../src/server/databases/mongoDB";
import {
	createCampusDB,
	createDailyOrderDB,
	createMenuItemDB,
	createSchoolDB,
	createUserDB,
	createVendorProfileDB,
	DailyOrderStatus,
	getCampusByShortCodeDB,
	getSiteConfigsDocDB,
	getUserByPhoneDB,
	LocationType,
	MenuCategory,
	setDailyOrderStatusDB,
	UserRole,
	updateVendorProfileDB,
	upsertSiteConfigsDB,
	VendorStatus,
	VendorType,
} from "../src/server/models";

function log(msg: string): void {
	process.stdout.write(`  ${msg}\n`);
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
	role: UserRole;
	firstName: string;
	lastName: string;
	phone: string;
}): Promise<{ _id: string; created: boolean }> {
	const existing = await getUserByPhoneDB({ phone: input.phone });
	if (existing) {
		log(`user ${input.phone} (${input.role}) exists`);
		return { _id: existing._id.toString(), created: false };
	}
	const created = await createUserDB({
		payload: { ...input, isPhoneVerified: true, isActive: true },
	});
	if (!created) throw new Error(`failed to create user ${input.phone}`);
	log(`user ${input.phone} (${input.role}) created`);
	return { _id: created._id.toString(), created: true };
}

async function main(): Promise<void> {
	process.stdout.write("\nSeeding Prechop…\n\n");
	await connectMongoDB();

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
		role: UserRole.SUPER_ADMIN,
		firstName: "Prechop",
		lastName: "Admin",
		phone: SEED_ADMIN_PHONE,
	});

	// ── Demo buyer ──────────────────────────────────────────────────────
	await ensureUser({
		campusId: unilag._id,
		role: UserRole.BUYER,
		firstName: "Ada",
		lastName: "Obi",
		phone: "08111111111",
	});

	// ── Demo vendor (fully onboarded) ───────────────────────────────────
	const vendorUser = await ensureUser({
		campusId: unilag._id,
		role: UserRole.VENDOR,
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
		await updateVendorProfileDB({
			id: vendorId,
			payload: {
				status: VendorStatus.ACTIVE,
				locationType: LocationType.ON_CAMPUS,
				description:
					"Home-style Nigerian meals, cooked fresh to order.",
				categories: [MenuCategory.MEALS, MenuCategory.DRINKS],
				isOpenForOrders: true,
				profileCompleteness: 100,
				// Sandbox subaccount — replace with a real Paystack subaccount code.
				paystackSubaccountCode: "ACCT_seeddemo0001",
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
		const menuSpecs = [
			{
				category: MenuCategory.MEALS,
				name: "Jollof Rice & Chicken",
				priceKobo: nairaToKobo(2500),
				estimatedPrepMin: 20,
			},
			{
				category: MenuCategory.MEALS,
				name: "Fried Rice & Turkey",
				priceKobo: nairaToKobo(3000),
				estimatedPrepMin: 25,
			},
			{
				category: MenuCategory.MEALS,
				name: "Amala & Ewedu",
				priceKobo: nairaToKobo(2000),
				estimatedPrepMin: 15,
			},
			{
				category: MenuCategory.DRINKS,
				name: "Chapman",
				priceKobo: nairaToKobo(800),
				estimatedPrepMin: 5,
			},
		];
		const menuItems = [];
		for (let i = 0; i < menuSpecs.length; i += 1) {
			const created = await createMenuItemDB({
				payload: {
					vendorId,
					campusId: unilag._id,
					displayOrder: i,
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
					snapshotPrepMin: m.estimatedPrepMin,
					maxQuantity: 25,
					addons:
						m.category === MenuCategory.MEALS
							? [
									{
										name: "Extra chicken",
										priceKobo: nairaToKobo(700),
									},
									{
										name: "Plantain",
										priceKobo: nairaToKobo(500),
									},
								]
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
