"use client";

import { useEffect, useState } from "react";
import { Button, Input, Stack, Text, Textarea } from "@/components";
import { api } from "@/constants/api";
import { useToast } from "@/hooks/useToast";

type Step = "request" | "verify" | "reset" | "support" | "done";

function errMsg(e: unknown): string {
  const m = (e as { response?: { data?: { message?: string } } })?.response
    ?.data?.message;
  return m ?? "Something went wrong. Please try again.";
}

export default function ForgotPinFlow({
  email,
  adminAuthorizedToken,
  onDone,
  onCancel,
}: {
  email: string;
  adminAuthorizedToken?: string | null;
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("request");
  const [loading, setLoading] = useState(false);
  const [otp, setOtp] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [supportReason, setSupportReason] = useState("");
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [devOtp, setDevOtp] = useState<string | null>(null);

  useEffect(() => {
    if (!adminAuthorizedToken) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await api.post(
          "/vendors/me/security/forgot-pin/authorize",
          {
            token: adminAuthorizedToken,
          },
        );
        const token = (res.data as { data?: { resetToken?: string } })?.data
          ?.resetToken;
        if (!token) throw new Error("Missing reset token");
        if (cancelled) return;
        setResetToken(token);
        setStep("reset");
        toast("Admin verification approved. Please set a new PIN.", "success");
      } catch (e) {
        if (cancelled) return;
        toast(errMsg(e), "error");
        setStep("support");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminAuthorizedToken, toast]);

  async function requestOtp() {
    setLoading(true);
    try {
      const res = await api.post("/vendors/me/security/forgot-pin/request", {
        email,
      });
      setDevOtp(
        (res.data as { data: { devOtp?: string } })?.data?.devOtp ?? null,
      );
      setStep("verify");
      toast("Verification code sent to your email.", "success");
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    if (!/^\d{6}$/.test(otp.trim())) {
      toast("Enter the 6-digit code from your email.", "error");
      return;
    }
    setLoading(true);
    try {
      const res = await api.post("/vendors/me/security/forgot-pin/verify", {
        email,
        otp: otp.trim(),
      });
      const token = (res.data as { data: { resetToken?: string } })?.data
        ?.resetToken;
      if (!token) throw new Error("Missing reset token");
      setResetToken(token);
      setStep("reset");
      toast("Code verified. Create a new PIN.", "success");
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setLoading(false);
    }
  }

  async function resetPin() {
    if (!/^\d{4,6}$/.test(newPin.trim())) {
      toast("PIN must be 4-6 digits.", "error");
      return;
    }
    if (newPin.trim() !== confirmPin.trim()) {
      toast("PINs do not match.", "error");
      return;
    }
    if (!resetToken) {
      toast("Missing reset token. Start over.", "error");
      return;
    }
    setLoading(true);
    try {
      await api.post("/vendors/me/security/forgot-pin/reset", {
        resetToken,
        newPin: newPin.trim(),
      });
      setStep("done");
      toast("Security PIN reset successfully.", "success");
      onDone?.();
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setLoading(false);
    }
  }

  async function requestSupport() {
    if (!supportReason.trim() || supportReason.trim().length < 10) {
      toast(
        "Please provide at least 10 characters explaining your issue.",
        "error",
      );
      return;
    }
    setLoading(true);
    try {
      await api.post("/vendors/me/security/forgot-pin/support", {
        reason: supportReason.trim(),
      });
      setStep("done");
      toast(
        "Support request submitted. An admin will review your identity.",
        "success",
      );
      onDone?.();
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Stack $gap={12}>
      <Text $weight={700}>Forgot security PIN?</Text>
      <Text $muted $size={13}>
        Reset your PIN via email or contact support if you can't access your
        verified email.
      </Text>

      {step === "request" && (
        <Stack $gap={10}>
          <Text $muted $size={13}>
            We'll send a 6-digit verification code to <strong>{email}</strong>.
          </Text>
          <Button $loading={loading} onClick={requestOtp} $variant="secondary">
            Send verification code
          </Button>
          {devOtp && (
            <Text $muted $size={12}>
              Dev code: {devOtp}
            </Text>
          )}
          {onCancel && (
            <Button $variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </Stack>
      )}

      {step === "verify" && (
        <Stack $gap={10}>
          <Text $muted $size={13}>
            Enter the 6-digit code sent to {email}.
          </Text>
          <Input
            label="Verification code"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            placeholder="123456"
            inputMode="numeric"
            maxLength={6}
          />
          <Button $loading={loading} onClick={verifyOtp} $variant="secondary">
            Verify code
          </Button>
          {onCancel && (
            <Button $variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </Stack>
      )}

      {step === "reset" && (
        <Stack $gap={10}>
          <Text $muted $size={13}>
            Create a new 4-6 digit security PIN.
          </Text>
          <Input
            label="New PIN"
            type="password"
            value={newPin}
            onChange={(e) => setNewPin(e.target.value)}
            placeholder="4-6 digits"
            inputMode="numeric"
            maxLength={6}
          />
          <Input
            label="Confirm new PIN"
            type="password"
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value)}
            placeholder="Re-enter PIN"
            inputMode="numeric"
            maxLength={6}
          />
          <Button $loading={loading} onClick={resetPin}>
            Reset PIN
          </Button>
          {onCancel && (
            <Button $variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </Stack>
      )}

      {step === "support" && (
        <Stack $gap={10}>
          <Text $muted $size={13}>
            Explain why you cannot access your verified email. An admin will
            manually verify your identity.
          </Text>
          <Textarea
            label="Reason"
            value={supportReason}
            onChange={(e) => setSupportReason(e.target.value)}
            placeholder="I no longer have access to this email..."
          />
          <Button
            $loading={loading}
            onClick={requestSupport}
            $variant="secondary">
            Submit support request
          </Button>
          {onCancel && (
            <Button $variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </Stack>
      )}

      {step === "done" && (
        <Stack $gap={10}>
          <Text $weight={700}>Done</Text>
          <Text $muted $size={13}>
            Your request has been processed. Check your email or support updates
            for next steps.
          </Text>
          {onCancel && (
            <Button $variant="ghost" onClick={onCancel}>
              Close
            </Button>
          )}
        </Stack>
      )}

      {step === "request" && onCancel && (
        <Button $variant="ghost" $size="sm" onClick={() => setStep("support")}>
          I can't access my email
        </Button>
      )}
    </Stack>
  );
}
