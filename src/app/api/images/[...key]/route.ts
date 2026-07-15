import { handleError, withApiHandler } from "@/server/lib";
import { s3Provider } from "@/server/providers";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/images/[...key]", rateLimit: false, csrf: false },
	async ({ context }) => {
		try {
			const { key } = await (
				context as { params: Promise<{ key: string[] }> }
			).params;
			const objectKey = key.join("/");
			if (!isAllowedImageKey(objectKey)) {
				return new Response("Not found", { status: 404 });
			}
			const readUrl = await s3Provider.getPresignedReadUrl(objectKey);
			const image = await fetch(readUrl);
			if (!image.ok || !image.body) {
				return new Response("Not found", { status: 404 });
			}
			return new Response(image.body, {
				status: 200,
				headers: {
					"content-type":
						image.headers.get("content-type") ?? "image/jpeg",
					"cache-control": "public, max-age=86400",
				},
			});
		} catch (e) {
			return handleError(e);
		}
	},
);

function isAllowedImageKey(key: string): boolean {
	return (
		(key.startsWith("menu-items/") || key.startsWith("vendor-profiles/")) &&
		/\.(jpe?g|png|webp)$/i.test(key)
	);
}
