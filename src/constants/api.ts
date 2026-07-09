import axios, { type AxiosInstance } from "axios";

// Single axios instance for the SPA. Cookies (access/refresh) travel
// automatically via `withCredentials`. On a 401 we attempt one silent refresh;
// if that fails the user is bounced to /login.
export const api: AxiosInstance = axios.create({
	baseURL: "/api",
	withCredentials: true,
	headers: { "Content-Type": "application/json" },
});

let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
	if (!refreshing) {
		refreshing = api
			.post("/auth/refresh")
			.then(() => true)
			.catch(() => false)
			.finally(() => {
				refreshing = null;
			});
	}
	return refreshing;
}

api.interceptors.response.use(
	(res) => res,
	async (error) => {
		const status = error?.response?.status;
		const original = error?.config;
		if (status === 401 && original && !original.__retried) {
			original.__retried = true;
			// `/users/me` is the silent auth probe fired on every page load. A 401
			// there simply means "anonymous" — `useAuth` handles it. Never treat it
			// as an expired session, or public pages (shared listing links, landing)
			// would bounce every visitor to /login before they can even browse.
			const reqUrl: string = original.url ?? "";
			const isAuthProbe = reqUrl.includes("/users/me");
			if (isAuthProbe) return Promise.reject(error);

			// Auth endpoints must never trigger a refresh: a 401 from OTP verify,
			// login, register or the refresh call itself is a genuine failure, not
			// an expired session. Attempting a refresh here deadlocks (the refresh
			// call's own 401 re-enters this interceptor and awaits the in-flight
			// refresh promise) — which is what made OTP verify spin forever.
			const isAuthEndpoint = reqUrl.startsWith("/auth/");
			if (isAuthEndpoint) return Promise.reject(error);

			const ok = await tryRefresh();
			if (ok) return api(original);
			if (typeof window !== "undefined") {
				const path = window.location.pathname;
				// Public pages must not force a login redirect on a background 401.
				const isPublicPage =
					path === "/" ||
					path === "/login" ||
					path.startsWith("/o/") ||
					path.startsWith("/order/");
				if (!isPublicPage) {
					window.location.href = `/login?next=${encodeURIComponent(path)}`;
				}
			}
		}
		return Promise.reject(error);
	},
);

// Envelope helper: the API returns { code, message, data }.
export async function apiData<T>(
	promise: Promise<{ data: { data: T } }>,
): Promise<T> {
	const res = await promise;
	return res.data.data;
}
