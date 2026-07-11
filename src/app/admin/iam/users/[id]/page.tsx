import AdminShell from "@/layouts/AdminShell";
import AdminUserDetailWrapper from "@/libs/AdminUserDetailWrapper";

export default async function AdminUserDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	return (
		<AdminShell>
			<AdminUserDetailWrapper userId={id} />
		</AdminShell>
	);
}
