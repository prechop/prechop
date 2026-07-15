"use client";

import { useState } from "react";
import styled from "styled-components";
import useSWR from "swr";
import {
	Badge,
	Button,
	Card,
	FadeIn,
	Input,
	Row,
	Stack,
	Text,
	Title,
} from "@/components";
import { PageLoader } from "@/components/Loader";
import { api } from "@/constants/api";
import { fetcher } from "@/constants/fetcher";
import { formatDateTime, formatKobo } from "@/constants/formatters";
import { useToast } from "@/hooks/useToast";

interface PaymentRequestSummary {
	status:
		| "AWAITING_EXTERNAL_PAYMENT"
		| "PAID"
		| "EXPIRED"
		| "CANCELLED";
	businessName: string;
	orderNumber: string;
	items: Array<{
		name: string;
		quantity: number;
		subtotalKobo: number;
		selectedOptions: Array<{
			name: string;
			quantity: number;
			subtotalKobo: number;
		}>;
	}>;
	subtotalKobo: number;
	serviceFeeKobo: number;
	totalKobo: number;
	expiresAt?: string;
	paymentDate?: string;
	receiptLink?: string;
}

const Wrap = styled(Stack)`
	max-width: 520px;
	margin: 0 auto;
`;
const Hero = styled(Card)`
	background: var(--pc-gradient-warm);
	border: none;
`;
const Line = styled(Row)`
	justify-content: space-between;
	font-size: 14px;
`;
const Divider = styled.div`
	border-top: 1px solid var(--pc-border);
	margin: 4px 0;
`;

export default function ExternalPaymentWrapper({ token }: { token: string }) {
	const { toast } = useToast();
	const { data, isLoading, mutate } = useSWR<PaymentRequestSummary>(
		`/payment-requests/${token}`,
		fetcher,
		{ refreshInterval: 10_000 },
	);
	const [contact, setContact] = useState("");
	const [paying, setPaying] = useState(false);

	if (isLoading) return <PageLoader />;
	if (!data) {
		return (
			<Wrap>
				<Card $accent>
					<Title $size={20}>Payment link unavailable</Title>
					<Text $muted>
						This payment request may be invalid or expired.
					</Text>
				</Card>
			</Wrap>
		);
	}

	const summary = data;
	const active = summary.status === "AWAITING_EXTERNAL_PAYMENT";

	async function pay() {
		if (!contact.trim()) {
			toast("Enter your email or phone number.", "error");
			return;
		}
		setPaying(true);
		try {
			const res = await api.post(
				`/payment-requests/${token}/initialize`,
				{ contact: contact.trim() },
			);
			const paymentUrl = res.data?.data?.paymentUrl as string | undefined;
			if (!paymentUrl) throw new Error("Missing payment URL");
			window.location.href = paymentUrl;
		} catch (error) {
			toast(errMsg(error), "error");
			await mutate();
			setPaying(false);
		}
	}

	function receiptDetails(): string {
		return [
			`Vendor: ${summary.businessName}`,
			`Order: ${summary.orderNumber}`,
			`Amount paid: ${formatKobo(summary.totalKobo)}`,
			`Payment status: ${statusLabel(summary.status)}`,
			`Payment date: ${summary.paymentDate ? formatDateTime(summary.paymentDate) : "Confirmed"}`,
			`Receipt: ${summary.receiptLink ?? ""}`,
		].join("\n");
	}

	async function shareReceipt() {
		if (!summary.receiptLink) {
			toast("Receipt link is not ready yet.", "error");
			return;
		}
		const text = receiptDetails();
		const shareData = {
			title: `Prechop receipt ${summary.orderNumber}`,
			text,
			url: summary.receiptLink,
		};
		try {
			if (navigator.share && navigator.canShare?.(shareData) !== false) {
				await navigator.share(shareData);
				return;
			}
			await navigator.clipboard.writeText(text);
			toast("Receipt details copied.", "success");
		} catch (error) {
			if ((error as { name?: string }).name === "AbortError") return;
			try {
				await navigator.clipboard.writeText(text);
				toast("Receipt details copied.", "success");
			} catch {
				toast("Could not share receipt.", "error");
			}
		}
	}

	return (
		<Wrap $gap={16}>
			<FadeIn>
				<Hero>
					<Stack $gap={8}>
						<Row $justify="space-between" $align="flex-start">
							<Stack $gap={4}>
								<Title $size={24}>{summary.businessName}</Title>
								<Text $muted $size={13}>
									Order {summary.orderNumber}
								</Text>
							</Stack>
							<Badge
								$tone={
									active
										? "warning"
										: summary.status === "PAID"
											? "success"
											: "danger"
								}
							>
								{statusLabel(summary.status)}
							</Badge>
						</Row>
						{summary.expiresAt && active && (
							<Text $muted $size={13}>
								Expires {formatDateTime(summary.expiresAt)}
							</Text>
						)}
					</Stack>
				</Hero>
			</FadeIn>

			<Card>
				<Stack $gap={10}>
					<Text $weight={800}>Order summary</Text>
					{summary.items.map((item) => (
						<Stack key={item.name} $gap={2}>
							<Line>
								<Text $weight={600}>
									{item.quantity}x {item.name}
								</Text>
								<Text $weight={600}>
									{formatKobo(item.subtotalKobo)}
								</Text>
							</Line>
							{item.selectedOptions.map((option) => (
								<Line key={`${item.name}-${option.name}`}>
									<Text $muted $size={13}>
										+ {option.name}
									</Text>
									<Text $muted $size={13}>
										{formatKobo(option.subtotalKobo)}
									</Text>
								</Line>
							))}
						</Stack>
					))}
					<Divider />
					<Line>
						<Text $muted>Subtotal</Text>
						<Text>{formatKobo(summary.subtotalKobo)}</Text>
					</Line>
					<Line>
						<Text $muted>Service fee</Text>
						<Text>{formatKobo(summary.serviceFeeKobo)}</Text>
					</Line>
					<Divider />
					<Line>
						<Text $weight={800} $size={16}>
							Total
						</Text>
						<Text $weight={800} $size={16}>
							{formatKobo(summary.totalKobo)}
						</Text>
					</Line>
				</Stack>
			</Card>

			{active ? (
				<Card $accent>
					<Stack $gap={12}>
						<Text $weight={800}>Pay securely with Paystack</Text>
						<Input
							label="Email or phone number"
							value={contact}
							onChange={(e) => setContact(e.target.value)}
							placeholder="you@example.com"
						/>
						<Button $full $size="lg" $loading={paying} onClick={pay}>
							Pay {formatKobo(summary.totalKobo)}
						</Button>
					</Stack>
				</Card>
			) : (
				<Card $accent>
					<Stack $gap={12}>
						<Text $muted>
						{summary.status === "PAID"
								? "This order has already been paid for."
								: "This payment request is no longer active."}
						</Text>
						{summary.status === "PAID" && summary.receiptLink && (
							<Button $full onClick={shareReceipt}>
								Share receipt
							</Button>
						)}
					</Stack>
				</Card>
			)}
		</Wrap>
	);
}

function statusLabel(status: PaymentRequestSummary["status"]): string {
	if (status === "AWAITING_EXTERNAL_PAYMENT") return "Awaiting payment";
	return status.charAt(0) + status.slice(1).toLowerCase();
}

function errMsg(error: unknown): string {
	const err = error as { response?: { data?: { message?: string } } };
	return err?.response?.data?.message ?? "Could not start payment.";
}
