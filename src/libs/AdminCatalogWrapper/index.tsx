"use client";

import { useState } from "react";
import styled from "styled-components";
import useSWR from "swr";
import {
	Badge,
	Button,
	Card,
	Input,
	PageHeader,
	Skeleton,
	Stack,
	Text,
} from "@/components";
import { api, apiData } from "@/constants/api";
import { fetcher } from "@/constants/fetcher";
import { formatKobo } from "@/constants/formatters";
import { useToast } from "@/hooks/useToast";

interface CatalogItem {
	id?: string;
	_id?: string;
	name: string;
	category: string;
	priceKobo: number;
	isAvailable: boolean;
	vendorId: string;
}
interface CatalogResult {
	items: CatalogItem[];
	total: number;
}

const Scroll = styled.div`
	overflow-x: auto;
	border-radius: var(--pc-radius);
`;
const Table = styled.table`
	width: 100%;
	border-collapse: collapse;
	font-size: 13.5px;
	th,
	td {
		text-align: left;
		padding: 11px 14px;
		white-space: nowrap;
		border-bottom: 1px solid var(--pc-border);
	}
	thead th {
		color: var(--pc-text-muted);
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		background: var(--pc-surface-2);
	}
`;

export default function AdminCatalogWrapper() {
	const { toast } = useToast();
	const [search, setSearch] = useState("");
	const { data, isLoading, mutate } = useSWR<CatalogResult>(
		`/admin/catalog${search ? `?search=${encodeURIComponent(search)}` : ""}`,
		fetcher,
	);
	const items = data?.items ?? [];

	async function toggle(item: CatalogItem) {
		const id = item.id ?? item._id;
		try {
			await apiData(
				api.patch(`/admin/catalog/${id}`, {
					isAvailable: !item.isAvailable,
				}),
			);
			toast(
				item.isAvailable ? "Item taken down." : "Item restored.",
				"success",
			);
			await mutate();
		} catch {
			toast("Update failed.", "error");
		}
	}

	return (
		<Stack $gap={20}>
			<PageHeader
				eyebrow="Moderation"
				title="Catalog"
				subtitle={`Browse and moderate menu items across all vendors${data ? ` · ${data.total} items` : ""}.`}
			/>
			<Input
				placeholder="Search menu items…"
				value={search}
				onChange={(e) => setSearch(e.target.value)}
			/>
			{isLoading ? (
				<Skeleton style={{ height: 200 }} />
			) : (
				<Card style={{ padding: 0 }}>
					<Scroll>
						<Table>
							<thead>
								<tr>
									<th>Item</th>
									<th>Category</th>
									<th>Price</th>
									<th>Status</th>
									<th></th>
								</tr>
							</thead>
							<tbody>
								{items.length === 0 ? (
									<tr>
										<td colSpan={5}>
											<Text $muted>No items found.</Text>
										</td>
									</tr>
								) : (
									items.map((it) => (
										<tr key={it.id ?? it._id}>
											<td>
												<Text $weight={600} $size={13}>
													{it.name}
												</Text>
											</td>
											<td>{it.category}</td>
											<td>{formatKobo(it.priceKobo)}</td>
											<td>
												<Badge
													$tone={
														it.isAvailable
															? "success"
															: "danger"
													}
												>
													{it.isAvailable
														? "Available"
														: "Taken down"}
												</Badge>
											</td>
											<td>
												<Button
													$variant="ghost"
													$size="sm"
													onClick={() => toggle(it)}
												>
													{it.isAvailable
														? "Take down"
														: "Restore"}
												</Button>
											</td>
										</tr>
									))
								)}
							</tbody>
						</Table>
					</Scroll>
				</Card>
			)}
		</Stack>
	);
}
