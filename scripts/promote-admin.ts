import {
  ADMINISTRATORS_GROUP,
} from "../src/server/constants";
import {
  connectMongoDB,
  disconnectMongoDB,
} from "../src/server/databases/mongoDB";
import {
  addUserToGroupDB,
  getUserByEmailDB,
} from "../src/server/models";
import {
  getBuiltInGroupId,
  seedBuiltInIam,
} from "../src/server/services/iam";

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();

async function main(): Promise<void> {
  if (!email) {
    throw new Error("ADMIN_EMAIL is required");
  }

  await connectMongoDB();

  await seedBuiltInIam();

  const user = await getUserByEmailDB({ email });

  if (!user) {
    throw new Error(
      `No user found with email: ${email}. Log in once before promoting the account.`,
    );
  }

  const administratorsGroupId =
    await getBuiltInGroupId(ADMINISTRATORS_GROUP);

  if (!administratorsGroupId) {
    throw new Error("Administrators group was not found");
  }

  await addUserToGroupDB({
    id: user._id.toString(),
    groupId: administratorsGroupId,
  });

  console.log("Administrator assigned successfully", {
    email,
    userId: user._id.toString(),
    administratorsGroupId,
  });
}

async function run(): Promise<void> {
  try {
    await main();
  } catch (error) {
    console.error("Admin promotion failed:", error);
    process.exitCode = 1;
  } finally {
    await disconnectMongoDB();
  }
}

void run();