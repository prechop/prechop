"use client";

import { useState } from "react";
import { Button, Input, Stack, Text } from "@/components";
import { api } from "@/constants/api";
import { useToast } from "@/hooks/useToast";

function errMsg(e: unknown): string {
	const m = (e as { response?: { data?: { message?: string } } })?.response
		?.data?.message;
	return m ?? "Something went wrong. Please try again.";
}

export default function VendorSecurityPinForm({
	securityPinReady,
	readOnly = false,
	onSaved,
}: {
	securityPinReady: boolean;
	readOnly?: boolean;
	onSaved?: () => void;
}) {
	const { toast } = useToast();
	const [pin, setPin] = useState("");
	const [confirmPin, setConfirmPin] = useState("");
	const [saving, setSaving] = useState(false);

	async function completeSecurityOnboarding() {
		if (!/^\d{4,6}$/.test(pin.trim())) {
			toast("Enter a 4-6 digit security PIN", "error");
			return;
		}
		if (pin.trim() !== confirmPin.trim()) {
			toast("Security PINs do not match", "error");
			return;
		}
		setSaving(true);
		try {
			await api.patch("/vendors/me/security-onboarding", {
				action: "COMPLETE",
				pin: pin.trim(),
			});
			setPin("");
			setConfirmPin("");
			toast("Security PIN saved", "success");
			onSaved?.();
		} catch (e) {
			toast(errMsg(e), "error");
		} finally {
			setSaving(false);
		}
	}

	if (securityPinReady) {
		return (
			<Text $muted $size={13}>
				Your security PIN is set. You will enter it each time you edit
				payout details.
			</Text>
		);
	}

	return (
		<Stack $gap={12}>
			<Text $muted $size={13}>
				Create a 4-6 digit security PIN before adding payout details or
				changing sensitive vendor settings.
			</Text>
			<Input
				label="Security PIN"
				type="password"
				inputMode="numeric"
				value={pin}
				disabled={readOnly || saving}
				onChange={(e) => setPin(e.target.value)}
				placeholder="4-6 digits"
			/>
			<Input
				label="Confirm PIN"
				type="password"
				inputMode="numeric"
				value={confirmPin}
				disabled={readOnly || saving}
				onChange={(e) => setConfirmPin(e.target.value)}
				placeholder="Re-enter PIN"
			/>
			<Button
				$loading={saving}
				disabled={readOnly || saving}
				onClick={completeSecurityOnboarding}
			>
				Save security PIN
			</Button>
		</Stack>
	);
}
