import { headers } from "next/headers";
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
  const requestHeaders = await headers();

  try {
    const auth = await verifyAuthToken(
      new Request("https://prechop.com.ng/admin", {
        headers: requestHeaders,
      }),
    );

    assertAdministrator(auth);
  } catch (error) {
    if (error === ErrUnauthorized) {
      redirect("/login?next=/admin");
    }

    throw error;
  }

  return children;
}
