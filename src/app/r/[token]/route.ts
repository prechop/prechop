import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getReferralLinkByTokenDB } from "@/server/models/referralLinks";
import { setAttributionToken } from "@/server/services/referrals/attribution";

export const runtime = "nodejs";

export async function GET(
	_request: Request,
	context: { params: Promise<{ token: string }> },
) {
	const { token } = await context.params;

	const link = await getReferralLinkByTokenDB({ token });
	if (!link) {
		return NextResponse.redirect(new URL("/", process.env.APP_URL ?? "http://localhost:3000"));
	}

	await setAttributionToken({
		token,
		vendorId: link.vendorId,
		creatorUserId: link.creatorUserId,
	});

	const cookieStore = await cookies();
	const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
	cookieStore.set("referral_token", token, {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax",
		expires: expiresAt,
		path: "/",
	});

	return NextResponse.redirect(
		new URL(`/v/${link.vendorId}`, process.env.APP_URL ?? "http://localhost:3000"),
	);
}
