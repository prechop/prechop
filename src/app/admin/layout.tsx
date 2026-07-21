import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ErrUnauthorized } from "@/server/constants";
import { assertAdministrator, verifyAuthToken } from "@/server/lib";

export const runtime = "nodejs";

export default async function AdminLayout({
	children,
}: {
	children: ReactNode;
}) {
	try {
		const auth = await verifyAuthToken(
			new Request("http://prechop.local/admin"),
		);
		assertAdministrator(auth);
	} catch (error) {
		if (error === ErrUnauthorized) {
			redirect("/login?next=/admin");
		}
		redirect("/marketplace");
	}

	return children;
}
