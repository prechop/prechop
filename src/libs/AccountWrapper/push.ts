import { api } from "@/constants/api";

// Turn a base64url VAPID public key into the BufferSource the Push API wants.
function urlBase64ToUint8Array(base64: string): BufferSource {
	const padding = "=".repeat((4 - (base64.length % 4)) % 4);
	const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
	const raw = atob(normalized);
	const buffer = new ArrayBuffer(raw.length);
	const output = new Uint8Array(buffer);
	for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
	return buffer;
}

// Subscribe the current device to web-push and register it with the API.
// Throws a user-friendly Error on any failure.
export async function enablePushNotifications(): Promise<void> {
	if (typeof window === "undefined") return;
	if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
		throw new Error("Push notifications aren't supported on this device.");
	}

	const permission = await Notification.requestPermission();
	if (permission !== "granted") {
		throw new Error("Notification permission was denied.");
	}

	const vapid = (await api.get("/push/vapid")).data?.data as
		| { publicKey: string }
		| string;
	const publicKey = typeof vapid === "string" ? vapid : vapid?.publicKey;
	if (!publicKey) throw new Error("Push is not configured.");

	const registration = await navigator.serviceWorker.ready;
	const existing = await registration.pushManager.getSubscription();
	const subscription =
		existing ??
		(await registration.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: urlBase64ToUint8Array(publicKey),
		}));

	const json = subscription.toJSON();
	await api.post("/push/subscribe", {
		endpoint: json.endpoint,
		keys: json.keys,
		userAgent: navigator.userAgent,
	});
}
