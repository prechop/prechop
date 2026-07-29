import mongoose, { type ConnectOptions } from "mongoose";
import { DB_NAME, MONGODB_URI } from "../constants";

interface IMongooseCache {
	conn: typeof mongoose | null;
	promise: Promise<typeof mongoose> | null;
}

declare global {
	// eslint-disable-next-line no-var
	var __prechopMongooseCache: IMongooseCache | undefined;
}

const cache: IMongooseCache = global.__prechopMongooseCache ?? {
	conn: null,
	promise: null,
};

if (!global.__prechopMongooseCache) {
	global.__prechopMongooseCache = cache;
}

/**
 * Connect to MongoDB with a process-wide cached connection. Safe to call
 * repeatedly across Next.js route-handler invocations.
 */
export async function connectMongoDB(): Promise<typeof mongoose> {
	if (cache.conn) return cache.conn;
	if (!cache.promise) {
		mongoose.set("strictQuery", false);
		const options: ConnectOptions = {
			enableUtf8Validation: true,
			ignoreUndefined: true,
			dbName: DB_NAME,
			autoIndex: true,
			maxPoolSize: 10,
			serverSelectionTimeoutMS: 8000,
		};
		cache.promise = mongoose.connect(MONGODB_URI, options).then((m) => {
			console.log("MongoDB database connected...");
			return m;
		});
	}
	try {
		cache.conn = await cache.promise;
	} catch (error) {
		cache.promise = null;
		throw error;
	}
	return cache.conn;
}

export async function disconnectMongoDB(): Promise<void> {
	if (cache.conn) {
		await mongoose.disconnect();
		cache.conn = null;
		cache.promise = null;
	}
}
