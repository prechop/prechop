"use client";

/**
 * "Order again" — PRD §8.9.
 *
 * A past order is a wish, not a cart. Between then and now the vendor may have
 * left, closed, listed nothing, listed something that hasn't opened yet, passed
 * cutoff, sold out half the items, or repriced them. This module asks the
 * server what is actually possible today (`POST /orders/{id}/reorder-preview`)
 * and then tells the buyer the truth before anything lands in a cart.
 *
 * Two rules this exists to enforce:
 *  1. Price changes are NEVER applied silently. A repriced reorder shows the
 *     old → new diff and requires a confirm.
 *  2. Nothing is added that can't actually be ordered. The prefill is a
 *     one-shot seed the listing page re-validates; it is not a cart.
 */

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styled from "styled-components";
import { Button, Card, Row, Stack, Text, Title } from "@/components";
import { api } from "@/constants/api";
import { formatKobo } from "@/constants/formatters";

/* ------------------------------------------------------------------ contract */

/**
 * Server-decided outcome. Listed in PRECEDENCE order — the first that applies
 * wins, because a buyer whose vendor has vanished does not care that a price
 * also changed. `ERROR` is client-side only (the request itself failed).
 */
export const REORDER_OUTCOMES = [
	"VENDOR_GONE",
	"VENDOR_CLOSED",
	"NO_LISTING",
	"NOT_STARTED",
	"LISTING_CLOSED",
	"PARTIAL",
	"PRICE_CHANGED",
	"ALL_AVAILABLE",
] as const;

export type ReorderOutcome = (typeof REORDER_OUTCOMES)[number];
export type ReorderState = ReorderOutcome | "ERROR";

export interface ReorderPreviewItem {
	/** Null when the item is not on today's menu at all. */
	dailyOrderItemId: string | null;
	name: string;
	quantity: number;
	available: boolean;
	/** Why it can't be ordered — "Sold out today", "Not on today's menu". */
	reason?: string | null;
	previousPriceKobo: number;
	currentPriceKobo?: number | null;
	selectedOptionIds?: string[];
}

export interface ReorderPreview {
	outcome: ReorderOutcome;
	vendorName?: string | null;
	/** The listing to seed + navigate to. Absent for the dead-end outcomes. */
	dailyOrderId?: string | null;
	shareableToken?: string | null;
	/** ISO time ordering opens — NOT_STARTED only. */
	opensAt?: string | null;
	items?: ReorderPreviewItem[] | null;
}

/* -------------------------------------------------------------------- styles */

const Backdrop = styled.div`
	position: fixed;
	inset: 0;
	z-index: 1000;
	background: rgba(0, 0, 0, 0.5);
	display: flex;
	align-items: flex-end;
	justify-content: center;
	animation: pc-fade-in var(--pc-dur) var(--pc-ease) both;
	@media (min-width: 640px) {
		align-items: center;
		padding: var(--pc-space-4);
	}
`;

/* Bottom-anchored by default: this is a phone product, and the thumb is at the
   bottom of the screen. Promotes to a centred dialog on wider viewports. */
const Sheet = styled(Card)`
	width: 100%;
	max-width: 520px;
	max-height: 88dvh;
	overflow-y: auto;
	border-radius: var(--pc-radius-lg) var(--pc-radius-lg) 0 0;
	padding: var(--pc-space-5) var(--pc-space-4)
		calc(var(--pc-space-5) + env(safe-area-inset-bottom));
	animation: pc-fade-up var(--pc-dur) var(--pc-ease-out) both;
	@media (min-width: 640px) {
		border-radius: var(--pc-radius-lg);
		padding: var(--pc-space-5);
	}
`;

const Grabber = styled.div`
	width: 40px;
	height: 4px;
	border-radius: 999px;
	background: var(--pc-border);
	margin: 0 auto var(--pc-space-2);
	@media (min-width: 640px) {
		display: none;
	}
`;

const ItemRow = styled(Row)<{ $muted?: boolean }>`
	justify-content: space-between;
	align-items: flex-start;
	gap: 10px;
	padding: 9px 0;
	border-bottom: 1px dashed var(--pc-border);
	&:last-child {
		border-bottom: none;
	}
	opacity: ${(p) => (p.$muted ? 0.7 : 1)};
`;

/* The glyph is the carrier of meaning, not the colour — a colour-blind buyer
   and a greyscale screen both still read "⚠" vs "✓". Colour only reinforces. */
const Glyph = styled.span<{ $ok: boolean }>`
	font-size: 13px;
	line-height: 1.5;
	flex: 0 0 auto;
	color: ${(p) =>
		p.$ok ? "var(--pc-color-success-ink)" : "var(--pc-color-warning-ink)"};
`;

const Old = styled.span`
	text-decoration: line-through;
	color: var(--pc-text-muted);
	font-weight: 600;
`;
const New = styled.span`
	font-weight: 800;
	color: var(--pc-color-primary-ink);
`;
const Skel = styled.div`
	height: 14px;
	border-radius: 8px;
	background: var(--pc-surface-2);
`;

/* ------------------------------------------------------------------- helpers */

function errState(): ReorderState {
	return "ERROR";
}

/**
 * Defensive re-derivation. The server owns the outcome, but if it sends
 * something we don't recognise — or sends PARTIAL/ALL_AVAILABLE while the item
 * list disagrees — we fall back to what the items actually say, so the sheet
 * can never claim "Everything's available" over a list of sold-out rows.
 */
export function resolveOutcome(preview: ReorderPreview): ReorderState {
	const outcome = preview.outcome;
	if (!REORDER_OUTCOMES.includes(outcome)) return errState();

	// The dead-end outcomes are purely vendor/listing level — trust the server.
	if (
		outcome === "VENDOR_GONE" ||
		outcome === "VENDOR_CLOSED" ||
		outcome === "NO_LISTING" ||
		outcome === "NOT_STARTED" ||
		outcome === "LISTING_CLOSED"
	)
		return outcome;

	const items = preview.items ?? [];
	if (items.length === 0) return errState();

	const usable = items.filter((i) => i.available && i.dailyOrderItemId);
	// Nothing survived — degrade rather than open an empty cart.
	if (usable.length === 0) return "PARTIAL";
	if (usable.length < items.length) return "PARTIAL";

	const repriced = usable.some(
		(i) =>
			i.currentPriceKobo != null &&
			i.currentPriceKobo !== i.previousPriceKobo,
	);
	if (repriced) return "PRICE_CHANGED";
	return "ALL_AVAILABLE";
}

function copyFor(
	state: ReorderState,
	preview: ReorderPreview | null,
	usableCount: number,
): { title: string; body: string } {
	const shop = preview?.vendorName?.trim() || "This kitchen";
	switch (state) {
		case "VENDOR_GONE":
			return {
				title: "This kitchen has left PreChop",
				body: `${shop} is no longer on the marketplace, so this order can't be repeated. There are other kitchens cooking today.`,
			};
		case "VENDOR_CLOSED":
			return {
				title: "This kitchen is closed today",
				body: `${shop} has paused orders. Nothing can be ordered from them until they reopen.`,
			};
		case "NO_LISTING":
			return {
				title: "Nothing on today's menu",
				body: `${shop} hasn't listed anything for today yet. Check back later.`,
			};
		case "NOT_STARTED":
			return {
				title: "Ordering hasn't opened yet",
				body: `${shop} is listed for today but isn't taking orders yet. You can look at the menu now and order once it opens.`,
			};
		case "LISTING_CLOSED":
			return {
				title: "Today's cutoff has passed",
				body: `${shop} has stopped taking orders for today. Their next listing will show on the marketplace.`,
			};
		case "PARTIAL":
			return usableCount === 0
				? {
						title: "None of your items are on today's menu",
						body: `${shop} is open, but nothing from this order is available today. Have a look at what they are cooking instead.`,
					}
				: {
						title: "Some items aren't available",
						body: "We can add what's still on today's menu. The rest is listed below so you can see what's missing.",
					};
		case "PRICE_CHANGED":
			return {
				title: "Prices have changed",
				body: "Everything from this order is available, but it doesn't cost the same as last time. Check the new prices before you continue.",
			};
		case "ALL_AVAILABLE":
			return {
				title: "Everything's still available",
				body: "Same items, same prices as last time. We'll drop them into your cart so you can review and pay.",
			};
		default:
			return {
				title: "We couldn't check that order",
				body: "Something went wrong on our side — your order and your payment are untouched. Please try again.",
			};
	}
}

/* --------------------------------------------------------------------- sheet */

export function ReorderSheet({
	state,
	preview,
	loading,
	onClose,
	onRetry,
}: {
	state: ReorderState | null;
	preview: ReorderPreview | null;
	loading: boolean;
	onClose: () => void;
	onRetry: () => void;
}) {
	const router = useRouter();
	const titleId = useId();
	const sheetRef = useRef<HTMLDivElement>(null);
	// `onClose` is an unstable inline prop; hold it in a ref so the modal
	// setup/teardown effect can run exactly once (on open/close) without
	// re-inert-ing the page or bouncing focus on every re-render.
	const onCloseRef = useRef(onClose);
	onCloseRef.current = onClose;

	// The sheet is hoisted to <body> via a portal so the rest of the page can be
	// marked `inert` (and aria-hidden) around it — a dialog can't be trapped if
	// its own ancestors are the thing being made inert.
	const [portal] = useState<HTMLDivElement | null>(() =>
		typeof document === "undefined" ? null : document.createElement("div"),
	);

	// Modal lifecycle, once per open:
	//  - focus enters the sheet, and is RETURNED to the trigger on close;
	//  - Tab is trapped inside the dialog (no escaping to the page behind);
	//  - Escape closes; the background is inert + hidden from assistive tech.
	useEffect(() => {
		if (!portal) return;
		document.body.appendChild(portal);

		// What to hand focus back to when we close (the "Order again" trigger).
		const trigger = document.activeElement as HTMLElement | null;

		// Inert + hide every other top-level branch of the page.
		const hidden: HTMLElement[] = [];
		for (const el of Array.from(document.body.children)) {
			const node = el as HTMLElement;
			if (node === portal) continue;
			if (node.hasAttribute("aria-hidden") || node.hasAttribute("inert"))
				continue;
			node.setAttribute("aria-hidden", "true");
			node.setAttribute("inert", "");
			hidden.push(node);
		}

		const prevOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		sheetRef.current?.focus();

		function focusables(): HTMLElement[] {
			const root = sheetRef.current;
			if (!root) return [];
			return Array.from(
				root.querySelectorAll<HTMLElement>(
					'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
				),
			).filter((el) => el.offsetParent !== null);
		}

		function onKey(e: KeyboardEvent) {
			if (e.key === "Escape") {
				onCloseRef.current();
				return;
			}
			if (e.key !== "Tab") return;
			const list = focusables();
			const root = sheetRef.current;
			if (!root) return;
			if (list.length === 0) {
				e.preventDefault();
				root.focus();
				return;
			}
			const first = list[0];
			const last = list[list.length - 1];
			const active = document.activeElement;
			if (e.shiftKey && (active === first || active === root)) {
				e.preventDefault();
				last.focus();
			} else if (!e.shiftKey && active === last) {
				e.preventDefault();
				first.focus();
			}
		}
		document.addEventListener("keydown", onKey);

		return () => {
			document.removeEventListener("keydown", onKey);
			document.body.style.overflow = prevOverflow;
			for (const node of hidden) {
				node.removeAttribute("aria-hidden");
				node.removeAttribute("inert");
			}
			if (portal.parentNode) portal.parentNode.removeChild(portal);
			// Return focus to the trigger so the keyboard user lands where they left.
			trigger?.focus?.();
		};
	}, [portal]);

	const items = preview?.items ?? [];
	const usable = items.filter((i) => i.available && i.dailyOrderItemId);
	const resolved: ReorderState = state ?? "ERROR";
	const { title, body } = copyFor(resolved, preview, usable.length);

	/** Seed the listing page and go. The seed is one-shot: OrderDetailWrapper
	 *  reads it, clears it, and re-validates every line against live stock. */
	function proceed() {
		const token = preview?.shareableToken;
		const dailyOrderId = preview?.dailyOrderId;
		if (!token || !dailyOrderId) return;
		if (typeof window !== "undefined" && usable.length > 0) {
			window.sessionStorage.setItem(
				`pch-reorder-${dailyOrderId}`,
				JSON.stringify(
					usable.map((i) => ({
						dailyOrderItemId: i.dailyOrderItemId,
						quantity: i.quantity,
						selectedOptionIds: i.selectedOptionIds ?? [],
					})),
				),
			);
		}
		onClose();
		router.push(`/o/${token}`);
	}

	const canProceed =
		!!preview?.shareableToken &&
		!!preview?.dailyOrderId &&
		usable.length > 0 &&
		(resolved === "PARTIAL" ||
			resolved === "PRICE_CHANGED" ||
			resolved === "ALL_AVAILABLE");

	const showItems =
		!loading &&
		items.length > 0 &&
		(resolved === "PARTIAL" ||
			resolved === "PRICE_CHANGED" ||
			resolved === "ALL_AVAILABLE");

	if (!portal) return null;

	return createPortal(
		/* Clicking the backdrop is a convenience dismissal only — Escape and the
		   Close button are the accessible paths, and Tab is trapped inside the
		   sheet, so no keyboard handler is duplicated onto this div. */
		<Backdrop onClick={onClose} data-testid="reorder-backdrop">
			<Sheet
				ref={sheetRef}
				role="dialog"
				aria-modal="true"
				/* `aria-labelledby` names the dialog once the <Title id={titleId}>
				   is rendered. During the loading branch that element doesn't exist,
				   so the reference resolves to nothing — this static `aria-label` is
				   the fallback that keeps the dialog named at every stage. */
				aria-label="Order again"
				aria-labelledby={titleId}
				aria-busy={loading}
				tabIndex={-1}
				onClick={(e) => e.stopPropagation()}
			>
				<Grabber aria-hidden />
				{loading ? (
					<Stack $gap={12} aria-live="polite">
						<Text $muted $size={13}>
							Checking today's menu…
						</Text>
						<Skel style={{ width: "65%", height: 20 }} />
						<Skel style={{ width: "90%" }} />
						<Skel style={{ width: "80%" }} />
						<Skel style={{ width: "45%" }} />
					</Stack>
				) : (
					<Stack $gap={14}>
						<Stack $gap={6}>
							<Title id={titleId} $size={19}>
								{title}
							</Title>
							<Text $muted $size={14}>
								{body}
							</Text>
							{resolved === "NOT_STARTED" && preview?.opensAt && (
								<Text $size={14} $weight={700}>
									Opens{" "}
									{new Date(preview.opensAt)
										.toLocaleTimeString("en-NG", {
											hour: "numeric",
											minute: "2-digit",
											hour12: true,
										})
										.replace(/\s/g, "")
										.toLowerCase()}
								</Text>
							)}
						</Stack>

						{showItems && (
							<Stack $gap={0}>
								{items.map((it) => {
									const ok =
										it.available && !!it.dailyOrderItemId;
									const repriced =
										ok &&
										it.currentPriceKobo != null &&
										it.currentPriceKobo !==
											it.previousPriceKobo;
									return (
										<ItemRow
											key={`${it.dailyOrderItemId ?? it.name}-${it.name}`}
											$muted={!ok}
										>
											<Row $gap={8} $align="flex-start">
												<Glyph $ok={ok} aria-hidden>
													{ok ? "✓" : "⚠"}
												</Glyph>
												<Text $size={14} $weight={600}>
													{it.quantity}× {it.name}
												</Text>
											</Row>
											<Text $size={14}>
												{ok ? (
													repriced ? (
														<>
															<Old>
																{formatKobo(
																	it.previousPriceKobo *
																		it.quantity,
																)}
															</Old>{" "}
															→{" "}
															<New>
																{formatKobo(
																	(it.currentPriceKobo ??
																		0) *
																		it.quantity,
																)}
															</New>
														</>
													) : (
														formatKobo(
															(it.currentPriceKobo ??
																it.previousPriceKobo) *
																it.quantity,
														)
													)
												) : (
													<Text
														as="span"
														$size={13}
														$weight={700}
														style={{
															color: "var(--pc-color-warning-ink)",
														}}
													>
														{it.reason ||
															"Not available today"}
													</Text>
												)}
											</Text>
										</ItemRow>
									);
								})}
							</Stack>
						)}

						<Stack $gap={8}>
							{canProceed && (
								<Button $full $size="lg" onClick={proceed}>
									{resolved === "PRICE_CHANGED"
										? "Continue with new prices →"
										: resolved === "PARTIAL"
											? `Add ${usable.length} available item${
													usable.length === 1
														? ""
														: "s"
												} →`
											: "Add to cart →"}
								</Button>
							)}
							{resolved === "ERROR" && (
								<Button $full $size="lg" onClick={onRetry}>
									Try again
								</Button>
							)}
							{/* A dead end still needs somewhere to go. */}
							{!canProceed && resolved !== "ERROR" && (
								<Button
									$full
									$size="lg"
									onClick={() => {
										onClose();
										router.push(
											preview?.shareableToken &&
												resolved === "NOT_STARTED"
												? `/o/${preview.shareableToken}`
												: "/marketplace",
										);
									}}
								>
									{resolved === "NOT_STARTED"
										? "View the menu →"
										: "Browse kitchens →"}
								</Button>
							)}
							<Button $full $variant="ghost" onClick={onClose}>
								Close
							</Button>
						</Stack>
					</Stack>
				)}
			</Sheet>
		</Backdrop>,
		portal,
	);
}

/* ----------------------------------------------------------- button + wiring */

/**
 * Drop-in "Order again" control. Owns the request, the sheet and the prefill so
 * the two call sites (`/my-orders` cards, `/my-orders/[id]`) can't drift.
 *
 * Style props are passed through: `$variant="secondary" $size="sm" $pill` on a
 * card, `$full $size="lg"` on the detail page.
 */
export function OrderAgainButton({
	orderId,
	$variant = "secondary",
	$size = "sm",
	$pill,
	$full,
}: {
	orderId: string;
	$variant?: "primary" | "secondary" | "ghost";
	$size?: "sm" | "md" | "lg";
	$pill?: boolean;
	$full?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const [loading, setLoading] = useState(false);
	const [preview, setPreview] = useState<ReorderPreview | null>(null);
	const [state, setState] = useState<ReorderState | null>(null);

	const run = useCallback(async () => {
		setOpen(true);
		setLoading(true);
		setPreview(null);
		setState(null);
		try {
			const res = await api.post(
				`/orders/${orderId}/reorder-preview`,
				{},
			);
			const payload = res.data?.data as ReorderPreview;
			if (!payload) throw new Error("Empty reorder preview");
			setPreview(payload);
			setState(resolveOutcome(payload));
		} catch {
			// Never a blank sheet: a failed preview is its own rendered state.
			setPreview(null);
			setState("ERROR");
		} finally {
			setLoading(false);
		}
	}, [orderId]);

	return (
		<>
			<Button
				$variant={$variant}
				$size={$size}
				$pill={$pill}
				$full={$full}
				$loading={loading && !open}
				onClick={(e) => {
					// Defensive: this button sits over a stretched card-overlay link
					// on /my-orders. It's a sibling of the anchor (not nested), so a
					// click can't reach it — but suppress default/bubbling anyway in
					// case a future call site nests this control near a link.
					e.preventDefault();
					e.stopPropagation();
					run();
				}}
			>
				Order again
			</Button>
			{open && (
				<ReorderSheet
					state={state}
					preview={preview}
					loading={loading}
					onClose={() => setOpen(false)}
					onRetry={run}
				/>
			)}
		</>
	);
}

export default ReorderSheet;
