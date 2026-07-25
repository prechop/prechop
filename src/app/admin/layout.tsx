import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import {
	decodeJwtToken,
	ErrForbidden,
	ErrUnauthorized,
} from "@/server/constants";
import {
	ACCESS_COOKIE,
	assertAdministrator,
	getCookieValue,
	REFRESH_COOKIE,
	verifyAuthToken,
} from "@/server/lib";

export const runtime = "nodejs";

const ADMIN_NEXT = "/admin";

async function hasValidAccessToken(): Promise<boolean> {
	const accessToken = await getCookieValue(ACCESS_COOKIE);
	if (!accessToken) return false;
	return !!(await decodeJwtToken({ accessToken }).catch(() => null));
}

async function redirectToFreshSession(): Promise<never> {
	if (await getCookieValue(REFRESH_COOKIE)) {
		redirect(`/api/auth/refresh?next=${encodeURIComponent(ADMIN_NEXT)}`);
	}
	redirect(`/login?next=${encodeURIComponent(ADMIN_NEXT)}`);
}

export default async function AdminLayout({
	children,
}: {
	children: ReactNode;
}) {
	if (!(await hasValidAccessToken())) {
		await redirectToFreshSession();
	}

	const requestHeaders = await headers();
	const request = new Request(
		`${process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}${ADMIN_NEXT}`,
		{ headers: requestHeaders },
	);

	try {
		const auth = await verifyAuthToken(request);
		assertAdministrator(auth);
	} catch (error) {
		if (error === ErrUnauthorized) {
			await redirectToFreshSession();
		}
		if (error === ErrForbidden) {
			redirect("/");
		}
		throw error;
	}

	return children;
}
