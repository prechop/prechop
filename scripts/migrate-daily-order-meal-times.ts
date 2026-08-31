/**
 * One-time backfill migration.
 *
 *   npm run migrate:daily-order-meal-times
 *
 * Derives `marketplaceCategories` for existing dailyOrders that were created
 * before the meal-time feature. For each listing, it collects the unique
 * `mealTimes` from the menu items referenced in `items[].menuItemId` and
 * writes them back to the order.
 */

import {
	connectMongoDB,
	disconnectMongoDB,
} from "../src/server/databases/mongoDB";
import { DailyOrder, MenuItem } from "../src/server/models";
import { MealTime } from "../src/server/models/enums";

async function backfillDailyOrderMealTimes() {
	const batchSize = 100;
	let processed = 0;
	let updated = 0;
	let skipped = 0;

	const cursor = DailyOrder.find({
		$or: [
			{ marketplaceCategories: { $exists: false } },
			{ marketplaceCategories: { $size: 0 } },
		],
	}).cursor({ batchSize });

	for await (const order of cursor) {
		processed += 1;
		const menuItemIds = (order.items ?? [])
			.map((item: { menuItemId?: string }) => item.menuItemId)
			.filter((id: string | undefined): id is string => Boolean(id));

		if (menuItemIds.length === 0) {
			skipped += 1;
			continue;
		}

		const menuItems = await MenuItem.find({
			_id: { $in: menuItemIds },
		}).lean();

		const seen = new Set<string>();
		const mealTimes: string[] = [];

		for (const menuItem of menuItems) {
			for (const mealTime of menuItem.mealTimes ?? []) {
				if (!seen.has(mealTime)) {
					seen.add(mealTime);
					mealTimes.push(mealTime);
				}
			}
		}

		if (mealTimes.length === 0) {
			skipped += 1;
			continue;
		}

		await DailyOrder.updateOne(
			{ _id: order._id },
			{ $set: { marketplaceCategories: mealTimes } },
		);
		updated += 1;

		if (processed % 100 === 0) {
			process.stdout.write(
				`processed=${processed} updated=${updated} skipped=${skipped}\n`,
			);
		}
	}

	process.stdout.write(
		`dailyOrder meal-time backfill complete: processed=${processed} updated=${updated} skipped=${skipped}\n`,
	);
}

async function main() {
	await connectMongoDB();
	await backfillDailyOrderMealTimes();
	await disconnectMongoDB();
}

main().catch(async (error) => {
	process.stderr.write(
		`dailyOrder meal-time backfill failed: ${
			error instanceof Error ? error.message : String(error)
		}\n`,
	);
	await disconnectMongoDB();
	process.exit(1);
});
