"use client";

import { useState } from "react";
import styled from "styled-components";
import useSWR from "swr";
import { Button, Input, Select, Stack, Text } from "@/components";
import { api, apiData } from "@/constants/api";
import { fetcher } from "@/constants/fetcher";
import { useToast } from "@/hooks/useToast";
import type { VendorProfile } from "@/types";
import ForgotPinFlow from "@/libs/ForgotPinFlow";

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
const GuardNotice = styled.div`
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 12px 14px;
	border-radius: var(--pc-radius-sm);
	border: 1px solid var(--pc-color-gold);
	background: var(--pc-color-gold-50);
`;
const LockedPanel = styled.div`
	display: grid;
	gap: 10px;
	padding: 12px 14px;
	border-radius: var(--pc-radius-sm);
	border: 1px solid var(--pc-border);
	background: var(--pc-surface-2);
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
	initialEmail,
	onSaved,
	saveLabel = "Save bank details",
	readOnly = false,
	securityVerified = true,
	onSecureAccount,
}: {
	initialBankCode?: string;
	initialAccountName?: string;
	initialEmail?: string;
	onSaved?: (vendor: VendorProfile) => void;
	saveLabel?: string;
	readOnly?: boolean;
	securityVerified?: boolean;
	onSecureAccount?: () => void;
}) {
	const { toast } = useToast();
	const { data: banks } = useSWR<Bank[]>("/vendors/banks", fetcher);

	const [bankCode, setBankCode] = useState(initialBankCode ?? "");
	const [accountNumber, setAccountNumber] = useState("");
	const [resolved, setResolved] = useState<Resolved | null>(null);
	const [verifying, setVerifying] = useState(false);
	const [saving, setSaving] = useState(false);
	const [editing, setEditing] = useState(false);
	const [pin, setPin] = useState("");
	const [verifiedPin, setVerifiedPin] = useState("");
	const [showForgotPin, setShowForgotPin] = useState(false);
	const locked = readOnly || !securityVerified || !editing;

	// A verification is only valid for the exact bank + account it was made for.
	const isVerified =
		!!resolved &&
		resolved.bankCode === bankCode &&
		accountNumber.trim().length > 0;

	function resetVerification() {
		if (resolved) setResolved(null);
	}

	function lockForm() {
		setEditing(false);
		setPin("");
		setVerifiedPin("");
		setAccountNumber("");
		setResolved(null);
		setShowForgotPin(false);
	}

	async function verifyPin() {
		if (!/^\d{4,6}$/.test(pin.trim())) {
			toast("Enter your 4-6 digit security PIN", "error");
			return;
		}
		setVerifying(true);
		try {
			await api.post("/vendors/me/security-onboarding/verify", {
				pin: pin.trim(),
			});
			setVerifiedPin(pin.trim());
			setPin("");
			setEditing(true);
			toast("Security PIN verified", "success");
		} catch (e) {
			setVerifiedPin("");
			toast(errMsg(e), "error");
		} finally {
			setVerifying(false);
		}
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
		if (!isVerified || !resolved || !verifiedPin) return;
		setSaving(true);
		try {
			const chosen = banks?.find((b) => b.code === bankCode);
			const vendor = await apiData<VendorProfile>(
				api.post("/vendors/me/bank-details", {
					bankCode,
					accountNumber: accountNumber.trim(),
					...(chosen ? { bankName: chosen.name } : {}),
					securityPin: verifiedPin,
				}),
			);
			toast("Bank details saved", "success");
			lockForm();
			onSaved?.(vendor);
		} catch (e) {
			toast(errMsg(e), "error");
			setVerifiedPin("");
			setEditing(false);
		} finally {
			setSaving(false);
		}
	}

	return (
		<Stack $gap={12}>
			{!securityVerified && (
				<GuardNotice>
					<Text $weight={700}>Security verification required</Text>
					<Text $muted $size={13}>
						Complete vendor security verification before changing
						payout details.
					</Text>
					{onSecureAccount && (
						<Button
							$variant="secondary"
							$size="sm"
							onClick={onSecureAccount}
							style={{ alignSelf: "flex-start" }}
						>
							Secure my account
						</Button>
					)}
				</GuardNotice>
			)}

			{initialAccountName && !resolved && !editing && (
				<LockedPanel>
					<Text $muted $size={13}>
						Current payout account
					</Text>
					<Text $weight={700}>{initialAccountName}</Text>
					<Text $muted $size={12}>
						Account number hidden for security.
					</Text>
					{initialBankCode && (
						<Text $muted $size={12}>
							Bank code: {initialBankCode}
						</Text>
					)}
				</LockedPanel>
			)}

			{securityVerified && !editing && (
				<LockedPanel>
					<Text $weight={700}>
						{initialAccountName
							? "Bank details are locked"
							: "No payout account added"}
					</Text>
					<Text $muted $size={13}>
						Enter your vendor security PIN to edit payout details.
					</Text>
					<Input
						label="Security PIN"
						type="password"
						inputMode="numeric"
						value={pin}
						onChange={(e) => setPin(e.target.value)}
						placeholder="4-6 digits"
					/>
					<Button
						$variant="secondary"
						$loading={verifying}
						disabled={verifying || !pin.trim()}
						onClick={verifyPin}
					>
						{initialAccountName
							? "Edit bank details"
							: "Add bank details"}
					</Button>
					<Button
						$variant="ghost"
						$size="sm"
						onClick={() => setShowForgotPin((v) => !v)}
					>
						{showForgotPin ? "Hide reset options" : "Forgot PIN?"}
					</Button>
					{showForgotPin && (
						<ForgotPinFlow
							email={initialEmail ?? ""}
							onDone={() => setShowForgotPin(false)}
							onCancel={() => setShowForgotPin(false)}
						/>
					)}
				</LockedPanel>
			)}

			{editing && (
				<>
					<Select
						label="Bank"
						value={bankCode}
						disabled={locked}
						onChange={(e) => {
							setBankCode(e.target.value);
							resetVerification();
						}}
					>
						<option value="">Select bank…</option>
						{/* Paystack's bank list can contain entries that share a `code`,
				    so combine it with the name + index for a unique React key. */}
						{(banks ?? []).map((b, i) => (
							<option key={`${b.code}-${i}`} value={b.code}>
								{b.name}
							</option>
						))}
					</Select>

					<Input
						label="Account number"
						inputMode="numeric"
						value={accountNumber}
						disabled={locked}
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
								<Text $weight={700}>
									{resolved.accountName}
								</Text>
							</Stack>
						</Verified>
					) : (
						<Button
							$variant="secondary"
							$full
							$loading={verifying}
							disabled={
								locked ||
								verifying ||
								!bankCode ||
								!accountNumber.trim()
							}
							onClick={verify}
						>
							Verify account
						</Button>
					)}

					<Button
						$full
						$loading={saving}
						disabled={
							locked || saving || !isVerified || !verifiedPin
						}
						onClick={save}
					>
						{isVerified ? saveLabel : "Verify to continue"}
					</Button>

					<Button
						$variant="ghost"
						onClick={lockForm}
						disabled={saving}
					>
						Cancel editing
					</Button>
				</>
			)}
		</Stack>
	);
}
