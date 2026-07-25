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

  let auth;

  try {
    auth = await verifyAuthToken(
      new Request("https://prechop.com.ng/admin", {
        headers: requestHeaders,
      }),
    );
  } catch (error) {
    // Only an actual authentication failure should return to login.
    if (error === ErrUnauthorized) {
      redirect("/login?next=/admin");
    }

    throw error;
  }

  /*
   * Keep this outside the authentication catch.
   * If the administrator check fails, it must not redirect back to login,
   * because that causes the /admin ↔ /login loop.
   */
  assertAdministrator(auth);

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
