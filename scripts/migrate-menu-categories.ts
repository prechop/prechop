/**
 * One-time category migration.
 *
 *   npm run migrate:menu-categories
 *
 * Moves legacy categories into the current five-category model without
 * deleting menu items or vendor profile category tags.
 */

import {
	connectMongoDB,
	disconnectMongoDB,
} from "../src/server/databases/mongoDB";
import { MenuItem, VendorProfile } from "../src/server/models";

async function migrateMenuItemCategory(from: string, to: string) {
	const result = await MenuItem.updateMany(
		{ category: from },
		{ $set: { category: to } },
	);
	process.stdout.write(
		`menuItems ${from} -> ${to}: ${result.modifiedCount ?? 0}\n`,
	);
}

async function migrateVendorCategory(from: string, to: string) {
	const add = await VendorProfile.updateMany(
		{ categories: from },
		{ $addToSet: { categories: to } },
	);
	const pull = await VendorProfile.updateMany(
		{ categories: from },
		{ $pull: { categories: from } },
	);
	process.stdout.write(
		`vendorProfiles ${from} -> ${to}: added ${
			add.modifiedCount ?? 0
		}, removed ${pull.modifiedCount ?? 0}\n`,
	);
}

async function main() {
	await connectMongoDB();
	await migrateMenuItemCategory("SNACKS", "SNACKS_PASTRIES");
	await migrateMenuItemCategory("BAKED_GOODS", "CAKES_DESSERTS");
	await migrateVendorCategory("SNACKS", "SNACKS_PASTRIES");
	await migrateVendorCategory("BAKED_GOODS", "CAKES_DESSERTS");
	await disconnectMongoDB();
}

main().catch(async (error) => {
	process.stderr.write(
		`menu category migration failed: ${
			error instanceof Error ? error.message : String(error)
		}\n`,
	);
	await disconnectMongoDB();
	process.exit(1);
});
