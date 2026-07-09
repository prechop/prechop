"use client";

import { useState } from "react";
import styled from "styled-components";
import useSWR from "swr";
import { Button, Input, Select, Stack, Text } from "@/components";
import { api, apiData } from "@/constants/api";
import { fetcher } from "@/constants/fetcher";
import { useToast } from "@/hooks/useToast";
import type { VendorProfile } from "@/types";

interface Bank {
	name: string;
	code: string;
	active: boolean;
}
interface Resolved {
	accountName: string;
	bankName?: string;
	bankCode: string;
}

const Verified = styled.div`
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 12px 14px;
	border-radius: var(--pc-radius-sm);
	border: 1.5px solid var(--pc-color-accent);
	background: color-mix(in srgb, var(--pc-color-accent) 12%, transparent);
`;
const Tick = styled.span`
	display: inline-grid;
	place-items: center;
	width: 26px;
	height: 26px;
	border-radius: 999px;
	flex-shrink: 0;
	background: var(--pc-color-accent);
	color: #fff;
	font-weight: 800;
	font-size: 14px;
`;

function errMsg(e: unknown): string {
	const m = (e as { response?: { data?: { message?: string } } })?.response
		?.data?.message;
	return m ?? "Something went wrong. Please try again.";
}

/**
 * Bank payout form with an explicit Paystack verify step (#12): the vendor must
 * resolve the account and confirm the returned account name before the "Save"
 * button unlocks. Changing the bank or account number invalidates a prior
 * verification, forcing a re-check so a subaccount is never created for an
 * unconfirmed account.
 */
export default function BankDetailsForm({
	initialBankCode,
	initialAccountName,
	onSaved,
	saveLabel = "Save bank details",
}: {
	initialBankCode?: string;
	initialAccountName?: string;
	onSaved?: (vendor: VendorProfile) => void;
	saveLabel?: string;
}) {
	const { toast } = useToast();
	const { data: banks } = useSWR<Bank[]>("/vendors/banks", fetcher);

	const [bankCode, setBankCode] = useState(initialBankCode ?? "");
	const [accountNumber, setAccountNumber] = useState("");
	const [resolved, setResolved] = useState<Resolved | null>(null);
	const [verifying, setVerifying] = useState(false);
	const [saving, setSaving] = useState(false);

	// A verification is only valid for the exact bank + account it was made for.
	const isVerified =
		!!resolved &&
		resolved.bankCode === bankCode &&
		accountNumber.trim().length > 0;

	function resetVerification() {
		if (resolved) setResolved(null);
	}

	async function verify() {
		if (!bankCode || !accountNumber.trim()) {
			toast("Choose a bank and enter your account number", "error");
			return;
		}
		setVerifying(true);
		try {
			const result = await apiData<Resolved>(
				api.post("/vendors/me/bank/resolve", {
					bankCode,
					accountNumber: accountNumber.trim(),
				}),
			);
			setResolved(result);
			toast("Account verified", "success");
		} catch (e) {
			setResolved(null);
			toast(errMsg(e), "error");
		} finally {
			setVerifying(false);
		}
	}

	async function save() {
		if (!isVerified || !resolved) return;
		setSaving(true);
		try {
			const chosen = banks?.find((b) => b.code === bankCode);
			const vendor = await apiData<VendorProfile>(
				api.post("/vendors/me/bank-details", {
					bankCode,
					accountNumber: accountNumber.trim(),
					...(chosen ? { bankName: chosen.name } : {}),
				}),
			);
			toast("Bank details saved", "success");
			onSaved?.(vendor);
		} catch (e) {
			toast(errMsg(e), "error");
		} finally {
			setSaving(false);
		}
	}

	return (
		<Stack $gap={12}>
			{initialAccountName && !resolved && (
				<Text $muted $size={13}>
					Current payout account:{" "}
					<Text as="span" $weight={700}>
						{initialAccountName}
					</Text>
				</Text>
			)}

			<Select
				label="Bank"
				value={bankCode}
				onChange={(e) => {
					setBankCode(e.target.value);
					resetVerification();
				}}
			>
				<option value="">Select bank…</option>
				{(banks ?? []).map((b) => (
					<option key={b.code} value={b.code}>
						{b.name}
					</option>
				))}
			</Select>

			<Input
				label="Account number"
				inputMode="numeric"
				value={accountNumber}
				onChange={(e) => {
					setAccountNumber(e.target.value);
					resetVerification();
				}}
				placeholder="0123456789"
			/>

			{isVerified && resolved ? (
				<Verified>
					<Tick aria-hidden>✓</Tick>
					<Stack $gap={2}>
						<Text $size={12} $muted>
							Account name
						</Text>
						<Text $weight={700}>{resolved.accountName}</Text>
					</Stack>
				</Verified>
			) : (
				<Button
					$variant="secondary"
					$full
					$loading={verifying}
					disabled={verifying || !bankCode || !accountNumber.trim()}
					onClick={verify}
				>
					Verify account
				</Button>
			)}

			<Button
				$full
				$loading={saving}
				disabled={saving || !isVerified}
				onClick={save}
			>
				{isVerified ? saveLabel : "Verify to continue"}
			</Button>
		</Stack>
	);
}
