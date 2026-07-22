/**
 * Production-safe Prechop seed.
 *
 * Run with:
 *   pnpm seed:production
 *
 * Seeds only:
 * - Built-in IAM policies and groups
 * - Required site configuration
 * - Required campuses
 * - Required schools
 * - Designated administrator
 *
 * It does NOT create:
 * - Demo buyers
 * - Demo vendors
 * - Orders
 * - Reviews
 * - Notifications
 * - Menus
 * - Daily listings
 * - Analytics
 * - Paystack subaccounts
 *
 * This seed is idempotent and does not delete existing production data.
 */

import {
  ADMINISTRATORS_GROUP,
  SEED_ADMIN_EMAIL,
} from "../src/server/constants";
import {
  connectMongoDB,
  disconnectMongoDB,
} from "../src/server/databases/mongoDB";
import {
  addUserToGroupDB,
  createCampusDB,
  createSchoolDB,
  createUserDB,
  getCampusByShortCodeDB,
  getSiteConfigsDocDB,
  getUserByEmailDB,
  upsertSiteConfigsDB,
} from "../src/server/models";
import {
  getBuiltInGroupId,
  seedBuiltInIam,
} from "../src/server/services/iam";

const SEED_ADMIN_PHONE =
  process.env.SEED_ADMIN_PHONE?.trim() || "08000000000";

const NORMALIZED_ADMIN_EMAIL =
  SEED_ADMIN_EMAIL?.trim().toLowerCase() ?? "";

function log(message: string): void {
  process.stdout.write(`  ${message}\n`);
}

async function ensureCampus(input: {
  name: string;
  shortCode: string;
  state: string;
}): Promise<{ _id: string }> {
  const existing = await getCampusByShortCodeDB({
    shortCode: input.shortCode,
  });

  if (existing) {
    log(`campus ${input.shortCode} already exists`);

    return {
      _id: existing._id.toString(),
    };
  }

  const created = await createCampusDB({
    payload: input,
  });

  if (!created) {
    throw new Error(`Failed to create campus: ${input.shortCode}`);
  }

  log(`campus ${input.shortCode} created`);

  return {
    _id: created._id.toString(),
  };
}

async function ensureSchool(input: {
  name: string;
  state: string;
  type: "University" | "Polytechnic" | "College of Education";
}): Promise<void> {
  /*
   * Your existing createSchoolDB appears to return null when the school
   * already exists. This makes repeated runs safe if the model enforces
   * uniqueness by its natural fields.
   */
  const created = await createSchoolDB({
    payload: input,
  });

  if (created) {
    log(`school ${input.name} created`);
  } else {
    log(`school ${input.name} already exists or was skipped`);
  }
}

async function ensureAdministrator(input: {
  campusId: string;
  email: string;
  phone: string;
}): Promise<string> {
  const administratorsGroupId =
    await getBuiltInGroupId(ADMINISTRATORS_GROUP);

  if (!administratorsGroupId) {
    throw new Error(
      `Built-in group not found: ${ADMINISTRATORS_GROUP}`,
    );
  }

  log(
    `Administrators group resolved: ${administratorsGroupId}`,
  );

  const existing = await getUserByEmailDB({
    email: input.email,
  });

  if (existing) {
    await addUserToGroupDB({
      id: existing._id.toString(),
      groupId: administratorsGroupId,
    });

    log(
      `existing user ${input.email} added to or confirmed in ${ADMINISTRATORS_GROUP}`,
    );

    return existing._id.toString();
  }

  const created = await createUserDB({
    payload: {
      campusId: input.campusId,
      firstName: "Prechop",
      lastName: "Admin",
      email: input.email,
      phone: input.phone,
      groupIds: [administratorsGroupId],
      isActive: true,
    },
  });

  if (!created) {
    throw new Error(
      `Failed to create administrator: ${input.email}`,
    );
  }

  log(`administrator ${input.email} created`);

  return created._id.toString();
}

async function main(): Promise<void> {
  process.stdout.write(
    "\nRunning Prechop production seed...\n\n",
  );

  if (!NORMALIZED_ADMIN_EMAIL) {
    throw new Error(
      "SEED_ADMIN_EMAIL is required. Add the designated administrator email to the production environment.",
    );
  }

  await connectMongoDB();
  log("connected to MongoDB");

  /*
   * IAM must be seeded before creating the administrator because the
   * administrator user depends on the Administrators group.
   */
  await seedBuiltInIam();
  log("built-in IAM policies and groups seeded");

  const administratorsGroupId =
    await getBuiltInGroupId(ADMINISTRATORS_GROUP);

  if (!administratorsGroupId) {
    throw new Error(
      `IAM seed completed, but ${ADMINISTRATORS_GROUP} could not be resolved.`,
    );
  }

  /*
   * Initialise the site configuration only when no configuration exists.
   * Existing production settings are preserved.
   */
  const existingSiteConfig = await getSiteConfigsDocDB();

  if (!existingSiteConfig) {
    await upsertSiteConfigsDB({
      payload: {},
      updatedBy: "production-seed",
    });

    log("site configuration initialised");
  } else {
    log("site configuration already exists");
  }

  /*
   * Add only campuses that should genuinely be available in production.
   * Remove any campus below that Prechop is not yet launching in.
   */
  const unilag = await ensureCampus({
    name: "University of Lagos",
    shortCode: "UNILAG",
    state: "Lagos",
  });

  await ensureCampus({
    name: "University of Ibadan",
    shortCode: "UI",
    state: "Oyo",
  });

  /*
   * Add only schools that should appear in the production application.
   */
  await ensureSchool({
    name: "University of Lagos",
    state: "Lagos",
    type: "University",
  });

  await ensureSchool({
    name: "University of Ibadan",
    state: "Oyo",
    type: "University",
  });

  await ensureSchool({
    name: "Yaba College of Technology",
    state: "Lagos",
    type: "Polytechnic",
  });

  const administratorId = await ensureAdministrator({
    campusId: unilag._id,
    email: NORMALIZED_ADMIN_EMAIL,
    phone: SEED_ADMIN_PHONE,
  });

  process.stdout.write("\n✓ Production seed complete.\n\n");
  process.stdout.write(
    [
      `  Admin email     : ${NORMALIZED_ADMIN_EMAIL}`,
      `  Admin user ID   : ${administratorId}`,
      `  Admin group ID  : ${administratorsGroupId}`,
      "",
    ].join("\n"),
  );
}

async function run(): Promise<void> {
  try {
    await main();
  } catch (error) {
    console.error("\nProduction seed failed:", error);
    process.exitCode = 1;
  } finally {
    try {
      await disconnectMongoDB();
      log("disconnected from MongoDB");
    } catch (disconnectError) {
      console.error(
        "Failed to disconnect from MongoDB:",
        disconnectError,
      );

      process.exitCode = 1;
    }
  }
}

void run();