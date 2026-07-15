import "server-only";
import crypto from "node:crypto";
import {
	DeleteObjectCommand,
	GetObjectCommand,
	HeadObjectCommand,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
	AWS_ACCESS_KEY_ID,
	AWS_REGION,
	AWS_S3_BUCKET_NAME,
	AWS_SECRET_ACCESS_KEY,
} from "../constants";

const s3Client = new S3Client({
	region: AWS_REGION,
	credentials: {
		accessKeyId: AWS_ACCESS_KEY_ID,
		secretAccessKey: AWS_SECRET_ACCESS_KEY,
	},
});

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const PRESIGNED_UPLOAD_EXPIRY_SECONDS = 300; // 5 min
const PRESIGNED_READ_EXPIRY_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface PresignedUploadResult {
	uploadUrl: string;
	key: string;
	publicReadUrl: string;
}

class S3Provider {
	/** Pre-signed URL the client uploads directly to (file never hits our API). */
	async getPresignedUploadUrl(
		folder: "menu-items" | "vendor-profiles",
		mimeType: string,
	): Promise<PresignedUploadResult> {
		if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
			throw new Error(`Unsupported file type: ${mimeType}`);
		}
		const extension = mimeType.split("/")[1];
		const key = `${folder}/${crypto.randomUUID()}.${extension}`;
		const command = new PutObjectCommand({
			Bucket: AWS_S3_BUCKET_NAME,
			Key: key,
			ContentType: mimeType,
		});
		const uploadUrl = await getSignedUrl(s3Client, command, {
			expiresIn: PRESIGNED_UPLOAD_EXPIRY_SECONDS,
		});
		return {
			uploadUrl,
			key,
			publicReadUrl: `https://${AWS_S3_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${key}`,
		};
	}

	/** Upload a server-generated buffer (e.g. a PDF receipt). Returns the key. */
	async uploadBuffer(
		folder: "receipts",
		key: string,
		buffer: Buffer,
		contentType: string,
	): Promise<string> {
		const fullKey = `${folder}/${key}`;
		await s3Client.send(
			new PutObjectCommand({
				Bucket: AWS_S3_BUCKET_NAME,
				Key: fullKey,
				Body: buffer,
				ContentType: contentType,
			}),
		);
		return fullKey;
	}

	/**
	 * Temporary signed URL to read a private object (receipts).
	 *
	 * `expiresIn` is overridable because a signed URL is a bearer credential:
	 * anything redirected to a browser (a receipt) should be minutes-lived, not
	 * the 7 days that suits a cached image.
	 */
	async getPresignedReadUrl(
		key: string,
		expiresIn?: number,
	): Promise<string> {
		const command = new GetObjectCommand({
			Bucket: AWS_S3_BUCKET_NAME,
			Key: key,
		});
		return getSignedUrl(s3Client, command, {
			expiresIn: expiresIn ?? PRESIGNED_READ_EXPIRY_SECONDS,
		});
	}

	/** True when the object is present. Any other error propagates. */
	async objectExists(key: string): Promise<boolean> {
		try {
			await s3Client.send(
				new HeadObjectCommand({
					Bucket: AWS_S3_BUCKET_NAME,
					Key: key,
				}),
			);
			return true;
		} catch (error) {
			const status = (
				error as { $metadata?: { httpStatusCode?: number } }
			)?.$metadata?.httpStatusCode;
			if (status === 404 || status === 403) return false;
			throw error;
		}
	}

	async deleteObject(key: string): Promise<void> {
		await s3Client.send(
			new DeleteObjectCommand({ Bucket: AWS_S3_BUCKET_NAME, Key: key }),
		);
	}
}

export const s3Provider = new S3Provider();
