import { storeUrl } from "@/constants/shareLinks";
import { ErrVendorNotFound } from "@/server/constants";
import { handleError, ok, withApiHandler, withAuth } from "@/server/lib";
import {
	getVendorProfileByIdDB,
	getVendorProfileByUserIdDB,
} from "@/server/models";
import QRCode from "qrcode";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/stickers/preview" },
	withAuth(async ({ req, auth }) => {
		try {
			const body = await req.json();
			const { userId, vendorId } = body as {
				userId?: string;
				vendorId?: string;
			};

			let vendor: Awaited<ReturnType<typeof getVendorProfileByIdDB>>;
			if (vendorId) {
				vendor = await getVendorProfileByIdDB({ id: vendorId });
			} else if (userId) {
				vendor = await getVendorProfileByUserIdDB({ userId });
			} else {
				vendor = await getVendorProfileByUserIdDB({
					userId: auth.userId,
				});
			}

			if (!vendor) throw ErrVendorNotFound;

			const storeSlug = vendor.storeSlug || "shop";
			const shortId = vendor.vendorShortId || "VEND";
			const exampleCode = `${shortId}-1001`;
			const qrPath = `/k/${storeSlug}`;
			const storeLink = storeUrl(storeSlug);

			const qrDataUrl = await QRCode.toDataURL(storeLink, {
				width: 400,
				margin: 2,
				color: {
					dark: "#000000",
					light: "#ffffff",
				},
			});

			return ok({
				vendorName: vendor.businessName,
				shortId,
				exampleCode,
				qrUrl: qrPath,
				qrDataUrl,
				storeUrl: storeLink,
			});
		} catch (e) {
			return handleError(e);
		}
	}),
);
