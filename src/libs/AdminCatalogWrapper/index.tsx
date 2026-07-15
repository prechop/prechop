"use client";

import Link from "next/link";
import { useState } from "react";
import styled from "styled-components";
import useSWR from "swr";
import {
	Badge,
	Button,
	Card,
	Input,
	PageHeader,
	Row,
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
	vendorName?: string | null;
	vendorStatus?: string | null;
	vendorLocationType?: string | null;
	vendorState?: string | null;
	vendorAreaOrAddress?: string | null;
	campusName?: string | null;
	campusState?: string | null;
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
const TextButton = styled.button`
	border: 0;
	background: none;
	padding: 0;
	color: var(--pc-color-primary);
	font: inherit;
	font-weight: 700;
	cursor: pointer;
	text-align: left;
	&:hover {
		text-decoration: underline;
	}
`;
const TextLink = styled(Link)`
	color: var(--pc-color-primary);
	font-weight: 700;
	&:hover {
		text-decoration: underline;
	}
`;
const DetailPanel = styled(Card)`
	margin-top: var(--pc-space-4);
`;
const KV = styled.div`
	display: grid;
	grid-template-columns: minmax(120px, 0.35fr) 1fr;
	gap: var(--pc-space-3);
	padding: 10px 0;
	border-bottom: 1px solid var(--pc-border);
	&:last-child {
		border-bottom: 0;
	}
`;

function itemId(item: CatalogItem): string {
	return item.id ?? item._id ?? "";
}

function locationLabel(item: CatalogItem): string {
	const offCampusLocation = [item.vendorAreaOrAddress, item.vendorState]
		.filter(Boolean)
		.join(", ");
	if (offCampusLocation) return offCampusLocation;
	const campusLocation = [item.campusName, item.campusState]
		.filter(Boolean)
		.join(", ");
	return campusLocation || "—";
}

export default function AdminCatalogWrapper() {
	const { toast } = useToast();
	const [search, setSearch] = useState("");
	const [detail, setDetail] = useState<CatalogItem | null>(null);
	const { data, isLoading, mutate } = useSWR<CatalogResult>(
		`/admin/catalog${search ? `?search=${encodeURIComponent(search)}` : ""}`,
		fetcher,
	);
	const items = data?.items ?? [];

	async function toggle(item: CatalogItem) {
		const id = itemId(item);
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
									<th>Vendor</th>
									<th>Campus/Location</th>
									<th>Category</th>
									<th>Price</th>
									<th>Status</th>
									<th>Actions</th>
								</tr>
							</thead>
							<tbody>
								{items.length === 0 ? (
									<tr>
										<td colSpan={7}>
											<Text $muted>No items found.</Text>
										</td>
									</tr>
								) : (
									items.map((it) => (
										<tr key={itemId(it)}>
											<td>
												<TextButton
													type="button"
													onClick={() =>
														setDetail(it)
													}
												>
													{it.name}
												</TextButton>
											</td>
											<td>
												<TextLink
													href={`/admin/vendors?detail=${it.vendorId}`}
												>
													{it.vendorName ??
														"Unnamed vendor"}
												</TextLink>
											</td>
											<td>
												<Text $size={13}>
													{locationLabel(it)}
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
			{detail && (
				<DetailPanel>
					<Stack $gap={12}>
						<Row $justify="space-between" $align="center">
							<Text $weight={800} $size={16}>
								Item details
							</Text>
							<Button
								$variant="ghost"
								$size="sm"
								onClick={() => setDetail(null)}
							>
								Close
							</Button>
						</Row>
						<div>
							<KV>
								<Text $muted>Name</Text>
								<Text $weight={700}>{detail.name}</Text>
							</KV>
							<KV>
								<Text $muted>Vendor</Text>
								<TextLink
									href={`/admin/vendors?detail=${detail.vendorId}`}
								>
									{detail.vendorName ?? "Unnamed vendor"}
								</TextLink>
							</KV>
							<KV>
								<Text $muted>Campus/Location</Text>
								<Text>{locationLabel(detail)}</Text>
							</KV>
							<KV>
								<Text $muted>Category</Text>
								<Text>{detail.category}</Text>
							</KV>
							<KV>
								<Text $muted>Price</Text>
								<Text>{formatKobo(detail.priceKobo)}</Text>
							</KV>
							<KV>
								<Text $muted>Status</Text>
								<Badge
									$tone={
										detail.isAvailable
											? "success"
											: "danger"
									}
								>
									{detail.isAvailable
										? "Available"
										: "Taken down"}
								</Badge>
							</KV>
						</div>
					</Stack>
				</DetailPanel>
			)}
		</Stack>
	);
}
