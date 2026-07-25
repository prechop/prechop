import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ErrForbidden, ErrUnauthorized } from "@/server/constants";
import { connectMongoDB } from "@/server/databases";
import {
	assertAdministrator,
	getCookieValue,
	REFRESH_COOKIE,
	verifyAccessTokenOnly,
} from "@/server/lib";

export const runtime = "nodejs";

const ADMIN_NEXT = "/admin";

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
	const requestHeaders = await headers();
	const request = new Request(
		`${process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}${ADMIN_NEXT}`,
		{ headers: requestHeaders },
	);

	try {
		await connectMongoDB();
		const auth = await verifyAccessTokenOnly(request);
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
