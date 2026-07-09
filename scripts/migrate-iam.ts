/**
 * One-shot migration: back-fill IAM group membership for users created under
 * the legacy `role` enum (BUYER | VENDOR | SUPER_ADMIN).
 *
 *   pnpm migrate:iam
 *
 * Idempotent — users already in a group are skipped. Mapping:
 *   SUPER_ADMIN            → Administrators
 *   VENDOR / has profile   → Vendors
 *   everything else        → Buyers
 * After assigning, the legacy `role` field is unset.
 */

import mongoose from "mongoose";
import {
	ADMINISTRATORS_GROUP,
	BUYERS_GROUP,
	VENDORS_GROUP,
} from "../src/server/constants";
import {
	connectMongoDB,
	disconnectMongoDB,
} from "../src/server/databases/mongoDB";
import {
	getVendorProfileByUserIdDB,
	setUserGroupsDB,
} from "../src/server/models";
import { getBuiltInGroupId, seedBuiltInIam } from "../src/server/services/iam";

function log(msg: string): void {
	process.stdout.write(`  ${msg}\n`);
}

async function main(): Promise<void> {
	process.stdout.write("\nMigrating users → IAM groups…\n\n");
	await connectMongoDB();

	await seedBuiltInIam();
	log("IAM built-ins ensured");

	const adminGroup = await getBuiltInGroupId(ADMINISTRATORS_GROUP);
	const vendorGroup = await getBuiltInGroupId(VENDORS_GROUP);
	const buyerGroup = await getBuiltInGroupId(BUYERS_GROUP);
	if (!adminGroup || !vendorGroup || !buyerGroup) {
		throw new Error("built-in groups missing after seed");
	}

	const users = await mongoose.connection
		.collection("users")
		.find({ deleted: { $ne: true } })
		.project({ role: 1, groupIds: 1 })
		.toArray();

	let migrated = 0;
	let skipped = 0;
	for (const u of users) {
		const id = u._id.toString();
		if (Array.isArray(u.groupIds) && u.groupIds.length > 0) {
			skipped += 1;
			continue;
		}

		let groupId = buyerGroup;
		if (u.role === "SUPER_ADMIN") {
			groupId = adminGroup;
		} else if (u.role === "VENDOR") {
			groupId = vendorGroup;
		} else {
			const profile = await getVendorProfileByUserIdDB({ userId: id });
			if (profile) groupId = vendorGroup;
		}

		await setUserGroupsDB({ id, groupIds: [groupId] });
		migrated += 1;
	}

	// Drop the legacy field now that authorization is group-driven.
	const res = await mongoose.connection
		.collection("users")
		.updateMany({ role: { $exists: true } }, { $unset: { role: "" } });

	log(`migrated ${migrated} users, skipped ${skipped} (already grouped)`);
	log(`unset legacy role on ${res.modifiedCount} users`);

	process.stdout.write("\n✓ Migration complete.\n\n");
	await disconnectMongoDB();
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error("\nMigration failed:", err);
		process.exit(1);
	});
