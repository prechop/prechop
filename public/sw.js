// Prechop service worker — minimal offline shell + web-push handling.
const CACHE = "prechop-v1";
const OFFLINE_URLS = ["/", "/marketplace"];

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches.open(CACHE).then((c) => c.addAll(OFFLINE_URLS)).catch(() => {}),
	);
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
			),
	);
	self.clients.claim();
});

// Network-first for navigations, falling back to cache when offline.
self.addEventListener("fetch", (event) => {
	const req = event.request;
	if (req.method !== "GET" || req.url.includes("/api/")) return;
	if (req.mode === "navigate") {
		event.respondWith(
			fetch(req).catch(() => caches.match(req).then((r) => r || caches.match("/"))),
		);
	}
});

// Web-push: render the notification.
self.addEventListener("push", (event) => {
	let payload = { title: "Prechop", body: "You have an update." };
	try {
		if (event.data) payload = { ...payload, ...event.data.json() };
	} catch {}
	event.waitUntil(
		self.registration.showNotification(payload.title, {
			body: payload.body,
			icon: "/icons/icon-192.svg",
			badge: "/icons/icon-192.svg",
			data: payload.data || {},
		}),
	);
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	const url = (event.notification.data && event.notification.data.url) || "/my-orders";
	event.waitUntil(
		self.clients.matchAll({ type: "window" }).then((list) => {
			for (const client of list) {
				if (client.url.includes(url) && "focus" in client) return client.focus();
			}
			return self.clients.openWindow(url);
		}),
	);
});
