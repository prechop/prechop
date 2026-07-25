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

  console.log("[admin-layout] started", {
    host: requestHeaders.get("host"),
    hasCookieHeader: Boolean(requestHeaders.get("cookie")),
  });

  let auth;

  try {
    auth = await verifyAuthToken(
      new Request("https://prechop.com.ng/admin", {
        headers: requestHeaders,
      }),
    );

    console.log("[admin-layout] token verified", {
      userId: auth?.userId,
    });
  } catch (error) {
    console.error("[admin-layout] token verification failed", {
      unauthorized: error === ErrUnauthorized,
      message:
        error instanceof Error ? error.message : String(error),
    });

    if (error === ErrUnauthorized) {
      redirect("/login?next=/admin");
    }

    throw error;
  }

  console.log("[admin-layout] checking administrator", {
    userId: auth?.userId,
  });

  assertAdministrator(auth);

  console.log("[admin-layout] administrator allowed", {
    userId: auth?.userId,
  });

  return children;
}

// import { headers } from "next/headers";
// import { redirect } from "next/navigation";
// import type { ReactNode } from "react";
// import { ErrUnauthorized } from "@/server/constants";
// import { assertAdministrator, verifyAuthToken } from "@/server/lib";

// export const runtime = "nodejs";

// export default async function AdminLayout({
// 	children,
// }: {
// 	children: ReactNode;
// }) {
//   const requestHeaders = await headers();

//   const request = new Request(
//     `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/admin`,
//     {
//       headers: requestHeaders,
//     },
//   );

//   try {
//     const auth = await verifyAuthToken(request);
//     assertAdministrator(auth);
//   } catch (error) {
//     if (
//       error === ErrUnauthorized
//     ) {
//       redirect("/login?next=/admin");
//     }
//     throw error;
//   }

// 	return children;
// }
