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
	calculateBuyerServiceFeeKobo,
	calculateVendorCommissionKobo,
	generateOrderNumber,
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
	createBuyerOrderDB,
	createCampusDB,
	createDailyOrderDB,
	createMenuItemDB,
	createNotificationDB,
	createOptionGroupDB,
	createReviewDB,
	createSchoolDB,
	createUserDB,
	createVendorProfileDB,
	DailyOrderStatus,
	DayOfWeek,
	FulfillmentType,
	getCampusByShortCodeDB,
	getSiteConfigsDocDB,
	getUserByPhoneDB,
	getVendorProfileByUserIdDB,
	incrementDailyOrderItemQuantityDB,
	incrementDailyOrderTotalCountDB,
	LocationType,
	listDailyOrdersByVendorDB,
	MenuCategory,
	markBuyerOrderCancelledDB,
	markBuyerOrderPaidDB,
	OrderStatus,
	setBuyerOrderStatusDB,
	setDailyOrderStatusDB,
	updateVendorProfileDB,
	upsertAnalyticsSnapshotDB,
	upsertSiteConfigsDB,
	upsertTimetableEntryDB,
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

/**
 * Rich demo data layered on top of the core fixtures so every screen has
 * something realistic to show: a second active vendor with listings in every
 * status, buyer orders spanning the whole lifecycle (with reviews on the
 * completed ones), a weekly timetable, notifications and analytics snapshots.
 *
 * Runs once — keyed off the second vendor's phone — so re-seeding never piles
 * up duplicate orders. Uses model helpers directly (bypassing payment) so it
 * can place orders in any target status without a live Paystack call.
 */
// biome-ignore lint/suspicious/noExplicitAny: aggregated listing/order docs are loosely typed here.
type Loose = any;

async function enrichDemoData({
	unilagId,
}: {
	unilagId: string;
}): Promise<void> {
	const SENTINEL_PHONE = "08144444444";
	if (await getUserByPhoneDB({ phone: SENTINEL_PHONE })) {
		log("demo data already enriched — skipping orders/reviews/2nd vendor");
		return;
	}

	const HOUR = 60 * 60 * 1000;

	// Extra buyers so orders come from a believable spread of students.
	const buyers: string[] = [];
	const demoBuyer = await getUserByPhoneDB({ phone: "08111111111" });
	if (demoBuyer) buyers.push(demoBuyer._id.toString());
	for (const b of [
		{ firstName: "Emeka", lastName: "Okafor", phone: "08150000001" },
		{ firstName: "Ngozi", lastName: "Ade", phone: "08150000002" },
		{ firstName: "Yusuf", lastName: "Bello", phone: "08150000003" },
	]) {
		const u = await ensureUser({
			campusId: unilagId,
			groupName: BUYERS_GROUP,
			...b,
		});
		buyers.push(u._id);
	}
	const pick = (i: number) => buyers[i % buyers.length];
	log(`${buyers.length} demo buyers available for orders`);

	// ── Second active vendor: Bola's Buka ───────────────────────────────
	const bolaUser = await ensureUser({
		campusId: unilagId,
		groupName: VENDORS_GROUP,
		firstName: "Bola",
		lastName: "Adeyemi",
		phone: SENTINEL_PHONE,
	});
	const bolaProfile = await createVendorProfileDB({
		payload: {
			userId: bolaUser._id,
			campusId: unilagId,
			email: "bola@bolasbuka.ng",
			businessName: "Bola's Buka",
			vendorType: VendorType.STUDENT_COOK,
		},
	});
	if (!bolaProfile) {
		log("Bola's Buka profile already exists — skipping enrichment");
		return;
	}
	const bolaVendorId = bolaProfile._id.toString();
	await updateVendorProfileDB({
		id: bolaVendorId,
		payload: {
			status: VendorStatus.ACTIVE,
			locationType: LocationType.ON_CAMPUS,
			description: "Hearty swallow and soups at student prices.",
			categories: [MenuCategory.MEALS, MenuCategory.DRINKS],
			isOpenForOrders: true,
			profileCompleteness: 100,
			paystackSubaccountCode: "ACCT_seedbola0002",
			bankName: "Zenith Bank",
			accountName: "Bola's Buka",
			accountNumber: "1010101010",
		},
	});
	log("vendor 'Bola's Buka' created + activated");

	const bolaMenuSpecs = [
		{
			category: MenuCategory.MEALS,
			name: "Egusi & Pounded Yam",
			priceKobo: nairaToKobo(2800),
			estimatedPrepMin: 20,
		},
		{
			category: MenuCategory.MEALS,
			name: "Suya Platter",
			priceKobo: nairaToKobo(3500),
			estimatedPrepMin: 15,
		},
		{
			category: MenuCategory.DRINKS,
			name: "Chilled Zobo",
			priceKobo: nairaToKobo(700),
			estimatedPrepMin: 5,
		},
	];
	const bolaMenu: Loose[] = [];
	for (let i = 0; i < bolaMenuSpecs.length; i += 1) {
		const created = await createMenuItemDB({
			payload: {
				vendorId: bolaVendorId,
				campusId: unilagId,
				displayOrder: i,
				...bolaMenuSpecs[i],
			},
		});
		if (created) bolaMenu.push(created);
	}
	log(`${bolaMenu.length} menu items for Bola's Buka`);

	const snapItems = (items: Loose[]) =>
		items.map((m) => ({
			menuItemId: m._id.toString(),
			snapshotName: m.name,
			snapshotPriceKobo: m.priceKobo,
			snapshotPrepMin: m.estimatedPrepMin ?? 20,
			maxQuantity: 25,
		}));

	async function makeListing(input: {
		title: string;
		status: DailyOrderStatus;
		availableFrom: Date | null;
		cutoffMs: number;
		items: Loose[];
		delivery?: boolean;
	}): Promise<Loose> {
		const daily = await createDailyOrderDB({
			payload: {
				vendorId: bolaVendorId,
				campusId: unilagId,
				shareableToken: generateShareableToken(),
				title: input.title,
				scheduledDate: new Date(),
				availableFrom: input.availableFrom ?? undefined,
				cutoffTime: new Date(Date.now() + input.cutoffMs),
				pickupAvailable: true,
				deliveryAvailable: input.delivery ?? false,
				deliveryFeeKobo: input.delivery ? nairaToKobo(250) : 0,
				items: snapItems(input.items),
			},
		});
		if (daily && input.status !== DailyOrderStatus.DRAFT) {
			await setDailyOrderStatusDB({
				id: daily._id.toString(),
				vendorId: bolaVendorId,
				status: input.status,
				fromStatuses:
					input.status === DailyOrderStatus.ACTIVE
						? [DailyOrderStatus.DRAFT]
						: undefined,
			});
		}
		return daily;
	}

	const bolaLive = await makeListing({
		title: "Bola's Lunch Special",
		status: DailyOrderStatus.ACTIVE,
		availableFrom: null,
		cutoffMs: 5 * HOUR,
		items: bolaMenu,
		delivery: true,
	});
	await makeListing({
		title: "Weekend Peppersoup (coming soon)",
		status: DailyOrderStatus.ACTIVE,
		availableFrom: new Date(Date.now() + 2 * HOUR),
		cutoffMs: 6 * HOUR,
		items: bolaMenu.slice(0, 2),
	});
	await makeListing({
		title: "Draft Dinner Menu",
		status: DailyOrderStatus.DRAFT,
		availableFrom: new Date(Date.now() + 3 * HOUR),
		cutoffMs: 7 * HOUR,
		items: bolaMenu,
	});
	await makeListing({
		title: "Yesterday's Special",
		status: DailyOrderStatus.CLOSED,
		availableFrom: null,
		cutoffMs: -1 * HOUR,
		items: bolaMenu.slice(0, 1),
	});
	await makeListing({
		title: "Cancelled Party Pack",
		status: DailyOrderStatus.CANCELLED,
		availableFrom: null,
		cutoffMs: 4 * HOUR,
		items: bolaMenu,
	});
	log("Bola's Buka listings: live, coming-soon, draft, closed, cancelled");

	// ── Buyer orders across the whole lifecycle ─────────────────────────
	const adaUser = await getUserByPhoneDB({ phone: "08122222222" });
	const adaVendor = adaUser
		? await getVendorProfileByUserIdDB({ userId: adaUser._id.toString() })
		: null;
	const adaVendorId = adaVendor?._id.toString();
	const adaListings = adaVendorId
		? await listDailyOrdersByVendorDB({
				vendorId: adaVendorId,
				status: DailyOrderStatus.ACTIVE,
			})
		: [];
	const adaLive = adaListings[0] as Loose;

	const completed: Array<{
		orderId: string;
		buyerId: string;
		vendorId: string;
	}> = [];

	async function seedOrder(input: {
		listing: Loose;
		vendorId: string;
		buyerId: string;
		qty: number;
		fulfillment: FulfillmentType;
		target: OrderStatus;
	}): Promise<void> {
		const listingId = input.listing.id ?? input.listing._id.toString();
		const item = input.listing.items[0];
		const itemId = item.id ?? item._id.toString();
		const subtotal = item.snapshotPriceKobo * input.qty;
		const deliveryFee =
			input.fulfillment === FulfillmentType.DELIVERY
				? (input.listing.deliveryFeeKobo ?? 0)
				: 0;
		const serviceFee = calculateBuyerServiceFeeKobo(subtotal);
		const commission = calculateVendorCommissionKobo(subtotal);
		const vendorSettlement = Math.max(0, subtotal - commission);
		const created = await createBuyerOrderDB({
			payload: {
				orderNumber: generateOrderNumber(),
				dailyOrderId: listingId,
				vendorId: input.vendorId,
				buyerId: input.buyerId,
				campusId: unilagId,
				fulfillmentType: input.fulfillment,
				...(input.fulfillment === FulfillmentType.DELIVERY
					? {
							deliveryHostelName: "Kofo Hall",
							deliveryRoomNumber: "B12",
						}
					: {}),
				subtotalKobo: subtotal,
				deliveryFeeKobo: deliveryFee,
				platformFeeKobo: serviceFee,
				paymentProcessingFeeKobo: serviceFee,
				prechopCommissionKobo: commission,
				vendorFoodAmountKobo: vendorSettlement,
				vendorDeliveryAmountKobo: 0,
				vendorSettlementKobo: vendorSettlement,
				totalKobo: subtotal + serviceFee,
				items: [
					{
						dailyOrderItemId: itemId,
						menuItemId: item.menuItemId?.toString(),
						snapshotName: item.snapshotName,
						snapshotPriceKobo: item.snapshotPriceKobo,
						quantity: input.qty,
						subtotalKobo: subtotal,
						selectedOptions: [],
					},
				],
			},
		});
		if (!created) return;
		const id = created._id.toString();
		if (input.target === OrderStatus.CANCELLED) {
			await markBuyerOrderCancelledDB({
				id,
				reason: "Changed my mind",
				cancelledBy: "buyer",
			});
			return;
		}
		if (input.target === OrderStatus.PENDING_PAYMENT) return; // abandoned cart
		// Everything else was paid → advance to the target and reflect the
		// placed units on the listing's capacity + order counters.
		await markBuyerOrderPaidDB({ id });
		if (input.target !== OrderStatus.PAID)
			await setBuyerOrderStatusDB({ id, status: input.target });
		await incrementDailyOrderItemQuantityDB({
			dailyOrderId: listingId,
			dailyOrderItemId: itemId,
			by: input.qty,
		});
		await incrementDailyOrderTotalCountDB({
			dailyOrderId: listingId,
			by: 1,
		});
		if (input.target === OrderStatus.COMPLETED)
			completed.push({
				orderId: id,
				buyerId: input.buyerId,
				vendorId: input.vendorId,
			});
	}

	if (adaLive && adaVendorId) {
		const plan: Array<[OrderStatus, FulfillmentType, number]> = [
			[OrderStatus.PENDING_PAYMENT, FulfillmentType.PICKUP, 1],
			[OrderStatus.PAID, FulfillmentType.PICKUP, 2],
			[OrderStatus.PREPARING, FulfillmentType.DELIVERY, 1],
			[OrderStatus.READY, FulfillmentType.PICKUP, 1],
			[OrderStatus.COMPLETED, FulfillmentType.PICKUP, 3],
			[OrderStatus.COMPLETED, FulfillmentType.DELIVERY, 1],
			[OrderStatus.CANCELLED, FulfillmentType.PICKUP, 1],
		];
		for (let i = 0; i < plan.length; i += 1) {
			const [target, ff, qty] = plan[i];
			await seedOrder({
				listing: adaLive,
				vendorId: adaVendorId,
				buyerId: pick(i),
				qty,
				fulfillment: ff,
				target,
			});
		}
		log(`${plan.length} buyer orders on Ada's live listing (all statuses)`);
	}
	if (bolaLive) {
		await seedOrder({
			listing: bolaLive,
			vendorId: bolaVendorId,
			buyerId: pick(1),
			qty: 1,
			fulfillment: FulfillmentType.PICKUP,
			target: OrderStatus.PAID,
		});
		await seedOrder({
			listing: bolaLive,
			vendorId: bolaVendorId,
			buyerId: pick(2),
			qty: 2,
			fulfillment: FulfillmentType.PICKUP,
			target: OrderStatus.COMPLETED,
		});
	}

	// ── Reviews on the completed orders ─────────────────────────────────
	const reviewSpecs = [
		{ rating: 5, comment: "Absolutely delicious — will order again!" },
		{ rating: 4, comment: "Great food, delivery was a little slow." },
		{ rating: 5, comment: "Best jollof on campus." },
	];
	for (let i = 0; i < completed.length; i += 1) {
		const c = completed[i];
		const spec = reviewSpecs[i % reviewSpecs.length];
		await createReviewDB({
			payload: {
				buyerOrderId: c.orderId,
				vendorId: c.vendorId,
				buyerId: c.buyerId,
				rating: spec.rating,
				comment: spec.comment,
			},
		});
	}
	log(`${completed.length} reviews on completed orders`);

	// ── Weekly timetable for Ada ────────────────────────────────────────
	const adaMenuItemId = adaLive?.items?.[0]?.menuItemId?.toString();
	if (adaVendorId && adaMenuItemId) {
		const weekdays = [
			DayOfWeek.MONDAY,
			DayOfWeek.TUESDAY,
			DayOfWeek.WEDNESDAY,
			DayOfWeek.THURSDAY,
			DayOfWeek.FRIDAY,
		];
		for (const day of weekdays)
			await upsertTimetableEntryDB({
				vendorId: adaVendorId,
				menuItemId: adaMenuItemId,
				dayOfWeek: day,
				isOpen: true,
			});
		log(`${weekdays.length} timetable entries for Ada's Kitchen`);
	}

	// ── Notifications ───────────────────────────────────────────────────
	if (demoBuyer) {
		await createNotificationDB({
			payload: {
				userId: demoBuyer._id.toString(),
				title: "Order ready 🎉",
				body: "Your order from Ada's Kitchen is ready for pickup.",
				type: "ORDER_READY",
				isRead: false,
			},
		});
		await createNotificationDB({
			payload: {
				userId: demoBuyer._id.toString(),
				title: "Welcome to Prechop",
				body: "Browse campus kitchens and order lunch in minutes.",
				type: "SYSTEM",
				isRead: true,
			},
		});
	}
	if (adaUser) {
		await createNotificationDB({
			payload: {
				userId: adaUser._id.toString(),
				title: "New order received",
				body: "You have a new paid order — check your kitchen pipeline.",
				type: "NEW_ORDER",
				isRead: false,
			},
		});
	}
	log("demo notifications created");

	// ── Analytics snapshots for Ada (last 5 days) ───────────────────────
	if (adaVendorId) {
		for (let d = 1; d <= 5; d += 1) {
			const date = new Date();
			date.setDate(date.getDate() - d);
			date.setHours(0, 0, 0, 0);
			await upsertAnalyticsSnapshotDB({
				vendorId: adaVendorId,
				date,
				payload: {
					totalOrders: 6 + d,
					completedOrders: 4 + d,
					cancelledOrders: 1,
					totalRevenueKobo: nairaToKobo(12000 + d * 1500),
					avgOrderValueKobo: nairaToKobo(2500),
					newReviewCount: d % 2,
					avgRatingForDay: 4.5,
				},
			});
		}
		log("5 days of analytics snapshots for Ada's Kitchen");
	}
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
				categories: [MenuCategory.SNACKS_PASTRIES, MenuCategory.DRINKS],
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

	// ── Rich demo data (2nd vendor, orders, reviews, timetable, …) ───────
	await enrichDemoData({ unilagId: unilag._id });

	process.stdout.write("\n✓ Seed complete.\n");
	process.stdout.write(
		`\n  Admin login phone : ${SEED_ADMIN_PHONE}\n  Buyer login phone : 08111111111\n  Vendor login phone: 08122222222 (Ada's Kitchen)\n  Vendor login phone: 08144444444 (Bola's Buka)\n  Pending vendor    : 08133333333 (Campus Bites)\n  (OTP prints to server logs in dev.)\n\n`,
	);

	await disconnectMongoDB();
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error("\nSeed failed:", err);
		process.exit(1);
	});
