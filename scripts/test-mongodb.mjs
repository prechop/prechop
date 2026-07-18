import mongoose from "mongoose";

const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME || "prechop";

if (!uri) {
  console.error("MONGODB_URI is missing.");
  process.exit(1);
}

try {
  await mongoose.connect(uri, {
    dbName,
    serverSelectionTimeoutMS: 10000,
  });

  console.log("MongoDB connection successful.");
  console.log("Database:", mongoose.connection.name);
} catch (error) {
  console.error("MongoDB connection failed:");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}