import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ErrUnauthorized } from "@/server/constants";
import { assertAdministrator, verifyAuthToken } from "@/server/lib";

export const runtime = "nodejs";


import { headers } from "next/headers";


export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const requestHeaders = await headers();

  const request = new Request(
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/admin`,
    {
      headers: requestHeaders,
    },
  );

  try {
    const auth = await verifyAuthToken(request);
    assertAdministrator(auth);
  } catch (error) {
    if (
      error === ErrUnauthorized
    ) {
      redirect("/login?next=/admin");
    }

    redirect("/marketplace");
  }

  return children;
}
