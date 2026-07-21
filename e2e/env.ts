// Shared by the e2e web server and the seed command so signed sessions,
// encrypted contact data and fake payment settings all agree.

/** Throwaway secrets: obviously fake, valid only for e2e. */
export const E2E_APP_ENV: Record<string, string> = {
	JWT_ACCESS_TOKEN_SECRET: "e2e-access-secret-0123456789-0123456789-abcdef",
	JWT_REFRESH_TOKEN_SECRET: "e2e-refresh-secret-9876543210-9876543210-fedcba",
	ENCRYPTION_KEY:
		"00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff",

	PAYSTACK_SECRET_KEY: "e2e-fake-paystack-not-real",

	// Must not be localhost/127.0.0.1 or the production boot guard rejects it.
	// e2e never completes a real Paystack round trip.
	NEXT_PUBLIC_APP_URL: "https://prechop.com.ng",
	TRUSTED_PROXY: "1",
	DISABLE_RATE_LIMIT: "1",

	SEED_ADMIN_EMAIL: "prechopofficial@gmail.com",
	SEED_ADMIN_PHONE: "08130135756",
};
