import crypto from "node:crypto";
import { compare, hash } from "bcrypt";

const OTP_LENGTH = 6;
const BCRYPT_ROUNDS = 10;

export function generateOtp(): string {
	const min = 10 ** (OTP_LENGTH - 1);
	const max = 10 ** OTP_LENGTH - 1;
	return crypto.randomInt(min, max + 1).toString();
}

export function hashOtp(otp: string): Promise<string> {
	return hash(otp, BCRYPT_ROUNDS);
}

export function verifyOtp(otp: string, digest: string): Promise<boolean> {
	return compare(otp, digest);
}
