// Client-visible env (NEXT_PUBLIC_*). Safe to import in client components.
export const APP_URL =
	process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
export const PAYSTACK_PUBLIC_KEY =
	process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY ?? "";
export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
