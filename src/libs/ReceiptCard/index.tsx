"use client";

/**
 * Downloadable PDF receipt for a completed order — PRD §8.10.
 *
 * Deliberately narrow: this renders ONLY for COMPLETED orders. A receipt for an
 * order that hasn't been fulfilled is a document for a thing that didn't happen.
 * Cancelled/refunded orders get a refund note instead (see `RefundNote`).
 *
 * No polling here. `OrderStatusWrapper` already holds this order under SWR with
 * `refreshInterval: 20_000`, so a PENDING receipt becomes READY on the next
 * revalidation for free — a second timer would just double the request rate on
 * a network we're trying not to hammer.
 */

import styled from "styled-components";
import { Card, Row, Stack, Text } from "@/components";
// The real wire type now that `receiptStatus` has landed on GET /orders/{id};
// this replaces the local shim that stood in while the endpoint was being wired.
// Absent/null on orders placed before receipts existed → the NONE state.
import type { ReceiptStatus } from "@/types";

export type { ReceiptStatus };

const Skel = styled.div`
	height: 14px;
	width: 60%;
	border-radius: 8px;
	background: var(--pc-surface-2);
`;

const DownloadLink = styled.a`
	display: inline-flex;
	align-items: center;
	gap: 8px;
	align-self: flex-start;
	padding: 10px 16px;
	border-radius: var(--pc-radius-pill);
	background: var(--pc-surface-2);
	border: 1px solid var(--pc-border);
	font-size: 14px;
	font-weight: 700;
	color: var(--pc-color-primary-ink);
	transition: border-color var(--pc-dur) var(--pc-ease);
	&:hover {
		border-color: var(--pc-color-primary);
	}
	&:focus-visible {
		outline: 2px solid var(--pc-color-primary);
		outline-offset: 2px;
	}
`;

export function ReceiptCard({
	orderId,
	receiptStatus,
}: {
	orderId: string;
	receiptStatus?: ReceiptStatus | null;
}) {
	// NONE — an order from before the feature shipped. Say nothing rather than
	// promise a receipt that will never generate.
	if (!receiptStatus) return null;

	return (
		<Card>
			<Stack $gap={10}>
				<Text $weight={800}>Receipt</Text>

				{/* One STABLE live region that outlives the status transitions.
				    The receipt flips PENDING → READY (or FAILED) under SWR
				    revalidation; if the live region lived on the PENDING block it
				    would unmount before READY could be announced, so a SR user
				    waiting on the receipt would never hear it arrive. Keeping the
				    wrapper mounted and only swapping its contents announces each
				    change. */}
				<div aria-live="polite">
					{receiptStatus === "PENDING" && (
						<Stack $gap={8}>
							<Text $muted $size={14}>
								Preparing…
							</Text>
							<Skel />
						</Stack>
					)}

					{receiptStatus === "READY" && (
						<DownloadLink
							href={`/api/orders/${orderId}/receipt`}
							target="_blank"
							rel="noopener noreferrer"
						>
							Download receipt <span aria-hidden>↓</span>
						</DownloadLink>
					)}

					{/* A failed PDF is a cosmetic failure. Say so plainly — the
					    money is the thing the buyer is actually worried about. */}
					{receiptStatus === "FAILED" && (
						<Row $gap={10} $align="flex-start">
							<Text $size={18} aria-hidden>
								📄
							</Text>
							<Text $muted $size={14}>
								Your order and your payment are fine — this is
								only the PDF. We couldn't generate it this time.
							</Text>
						</Row>
					)}
				</div>
			</Stack>
		</Card>
	);
}

/**
 * Shown instead of a receipt on a cancelled or refunded order. There is no PDF
 * for an order that didn't complete, but "nothing here" is the wrong answer to
 * "where is my money" — so this states where the money went.
 */
export function RefundNote({ refunded }: { refunded: boolean }) {
	return (
		<Card $accent>
			<Row $gap={10} $align="flex-start">
				<Text $size={18} aria-hidden>
					{refunded ? "↩️" : "🚫"}
				</Text>
				<Stack $gap={4}>
					<Text $weight={800} $size={15}>
						{refunded
							? "This order was refunded"
							: "This order was cancelled"}
					</Text>
					<Text $muted $size={14}>
						{refunded
							? "Your refund was sent back to the account you paid from. Banks usually settle it within a few working days."
							: "No receipt is generated for a cancelled order. If you were charged, the refund goes back to the account you paid from."}
					</Text>
				</Stack>
			</Row>
		</Card>
	);
}

export default ReceiptCard;
