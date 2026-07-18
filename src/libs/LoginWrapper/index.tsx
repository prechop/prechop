"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import styled from "styled-components";
import {
	Button,
	Card,
	Container,
	FadeIn,
	Input,
	Stack,
	Text,
} from "@/components";
import { api } from "@/constants/api";
import { useAuth } from "@/hooks/Auth/useAuth";
import { useToast } from "@/hooks/useToast";

type Step = "phone" | "otp";
const PHONE_DIGITS = 11;
const OTP_DIGITS = 6;
const PHONE_ERROR = "Enter a valid Nigerian phone number.";
const STAFF_PERMISSIONS = [
	"iam:user:read",
	"onboarding:read",
	"analytics:read",
];

const Screen = styled.div`
	min-height: 100dvh;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: var(--pc-space-6) 0 var(--pc-space-8);
	background: var(--pc-gradient-mesh);
`;
const Wrap = styled(Container)`
	max-width: 460px;
`;
const Brand = styled.div`
	display: flex;
	flex-direction: column;
	align-items: center;
	text-align: center;
	gap: var(--pc-space-3);
	margin-bottom: var(--pc-space-5);
`;
const Mark = styled.div`
	width: 60px;
	height: 60px;
	display: grid;
	place-items: center;
	font-size: 30px;
	border-radius: var(--pc-radius-lg);
	background: var(--pc-gradient-hero);
	box-shadow: var(--pc-shadow-primary);
`;
const Wordmark = styled.h1`
	font-family: var(--pc-font-display);
	font-size: clamp(28px, 6vw, 34px);
	font-weight: 800;
	letter-spacing: -0.03em;
	color: var(--pc-text);
`;
const AuthCard = styled(Card)`
	padding: var(--pc-space-6);
	box-shadow: var(--pc-shadow-lg);
`;
const OtpBadge = styled.div`
	width: 52px;
	height: 52px;
	display: grid;
	place-items: center;
	font-size: 26px;
	border-radius: var(--pc-radius);
	background: var(--pc-color-primary-50);
	margin: 0 auto var(--pc-space-1);
`;
const Foot = styled(Text)`
	text-align: center;
	margin-top: var(--pc-space-5);
`;
const OtpBoxes = styled.div`
	display: grid;
	grid-template-columns: repeat(${OTP_DIGITS}, minmax(0, 1fr));
	gap: 8px;
`;
const OtpBox = styled.input`
	width: 100%;
	aspect-ratio: 1;
	border: 1.5px solid var(--pc-border);
	border-radius: var(--pc-radius-sm);
	background: var(--pc-surface);
	color: var(--pc-text);
	font-family: inherit;
	font-size: 20px;
	font-weight: 800;
	text-align: center;
	outline: none;
	transition:
		border-color var(--pc-dur) var(--pc-ease),
		box-shadow var(--pc-dur) var(--pc-ease);

	&:focus {
		border-color: var(--pc-color-primary);
		box-shadow: 0 0 0 4px var(--pc-color-primary-50);
	}

	&::placeholder {
		color: var(--pc-text-faint);
	}
`;
const FieldError = styled(Text)`
	color: var(--pc-color-danger);
`;

/**
 * Single unified login for every user. Enter a phone, receive an OTP, and on
 * verify the server auto-provisions a buyer for first-time phones; existing
 * accounts (buyer, vendor, staff) are redirected by their resolved permissions.
 * Vendors who want to sell apply separately via /sell.
 */
export default function LoginWrapper() {
	const router = useRouter();
	const params = useSearchParams();
	const { refresh } = useAuth();
	const { toast } = useToast();

	const [step, setStep] = useState<Step>("phone");
	const [loading, setLoading] = useState(false);
	const [phone, setPhone] = useState("");
	const [sentToPhone, setSentToPhone] = useState("");
	const [phoneError, setPhoneError] = useState("");
	const [otpDigits, setOtpDigits] = useState<string[]>(
		Array(OTP_DIGITS).fill(""),
	);
	const [otpError, setOtpError] = useState("");
	const otpRefs = useRef<Array<HTMLInputElement | null>>([]);
	const otp = otpDigits.join("");
	const isOtpComplete = otp.length === OTP_DIGITS;

	async function sendCode() {
		if (!isValidPhone(phone)) {
			setPhoneError(PHONE_ERROR);
			toast(PHONE_ERROR, "error");
			return;
		}
		setLoading(true);
		try {
			const res = await api.post("/auth/otp/request", { phone });
			const recipientPhone = getRecipientPhone(res.data);
			toast("Code sent to your phone", "success");
			setSentToPhone(recipientPhone ?? phone);
			setOtpDigits(Array(OTP_DIGITS).fill(""));
			setOtpError("");
			setStep("otp");
		} catch (e) {
			toast(errMsg(e), "error");
		} finally {
			setLoading(false);
		}
	}

	async function verify() {
		if (!isOtpComplete) {
			const message = "Enter the complete 6-digit verification code.";
			setOtpError(message);
			toast(message, "error");
			return;
		}
		setLoading(true);
		try {
			const res = await api.post("/auth/otp/verify", {
				phone,
				otp,
			});
			const u = res.data?.data?.user as
				| { groups?: string[]; permissions?: string[] }
				| undefined;
			const groups = u?.groups ?? [];
			const permissions = u?.permissions ?? [];
			await refresh();
			const next = params.get("next");
			// Staff (anyone who can read the IAM or onboarding console) → /admin.
			const isStaff =
				STAFF_PERMISSIONS.some((p) => permissions.includes(p)) ||
				groups.includes("Administrators");
			if (isStaff) {
				router.replace(
					isLocalPath(next) && next.startsWith("/admin")
						? next
						: "/admin",
				);
			} else if (isLocalPath(next)) router.replace(next);
			else if (groups.includes("Vendors")) router.replace("/dashboard");
			else router.replace("/marketplace");
		} catch (e) {
			toast(errMsg(e), "error");
		} finally {
			setLoading(false);
		}
	}

	function handlePhoneChange(value: string) {
		const next = onlyDigits(value).slice(0, PHONE_DIGITS);
		setPhone(next);
		setSentToPhone("");
		if (phoneError) setPhoneError("");
	}

	function handleOtpChange(index: number, value: string) {
		const digit = onlyDigits(value).slice(-1);
		const next = [...otpDigits];
		next[index] = digit;
		setOtpDigits(next);
		if (otpError) setOtpError("");
		if (digit && index < OTP_DIGITS - 1) {
			otpRefs.current[index + 1]?.focus();
		}
	}

	function handleOtpKeyDown(index: number, key: string) {
		if (key === "Backspace" && !otpDigits[index] && index > 0) {
			otpRefs.current[index - 1]?.focus();
		}
		if (key === "Enter") verify();
	}

	function handleOtpPaste(value: string) {
		const pasted = onlyDigits(value).slice(0, OTP_DIGITS);
		if (pasted.length !== OTP_DIGITS) {
			setOtpError("Paste the full 6-digit verification code.");
			return;
		}
		setOtpDigits(pasted.split(""));
		setOtpError("");
		otpRefs.current[OTP_DIGITS - 1]?.focus();
	}

	const otpValidationMessage =
		otpError ||
		(otp.length > 0 && !isOtpComplete
			? "Enter all 6 digits to continue."
			: "");

	return (
		<Screen>
			<Wrap>
				<FadeIn>
					<Brand>
						<Mark aria-hidden>🍲</Mark>
						<Stack $gap={2}>
							<Wordmark>Prechop</Wordmark>
							<Text $muted>Order before they cook.</Text>
						</Stack>
					</Brand>

					<AuthCard>
						{step === "phone" ? (
							<Stack $gap={14}>
								<Stack $gap={2}>
									<Text $weight={700} $size={18}>
										Log in or sign up
									</Text>
									<Text $muted $size={14}>
										Enter your phone number — we&apos;ll
										text you a code.
									</Text>
								</Stack>
								<Input
									label="Phone number"
									value={phone}
									onChange={(e) =>
										handlePhoneChange(e.target.value)
									}
									placeholder="08012345678"
									inputMode="tel"
									maxLength={PHONE_DIGITS}
									onKeyDown={(e) => {
										if (e.key === "Enter") sendCode();
									}}
								/>
								{phoneError && (
									<FieldError $size={13}>
										{phoneError}
									</FieldError>
								)}
								<Button
									$full
									$size="lg"
									$loading={loading}
									onClick={sendCode}
								>
									Send code
								</Button>
							</Stack>
						) : (
							<Stack $gap={14}>
								<Stack $gap={4} style={{ textAlign: "center" }}>
									<OtpBadge aria-hidden>📱</OtpBadge>
									<Text $weight={700} $size={17}>
										Check your phone
									</Text>
									<Text $muted $size={14}>
										Enter the 6-digit code sent to{" "}
										{sentToPhone || phone}.
									</Text>
								</Stack>
								<Stack $gap={7}>
									<Text
										as="label"
										$weight={700}
										$size={13}
										htmlFor="otp-0"
									>
										Verification code
									</Text>
									<OtpBoxes>
										{otpDigits.map((digit, index) => (
											<OtpBox
												key={`otp-${index}`}
												id={`otp-${index}`}
												ref={(el) => {
													otpRefs.current[index] = el;
												}}
												value={digit}
												inputMode="numeric"
												maxLength={1}
												aria-label={`Verification code digit ${index + 1}`}
												onChange={(e) =>
													handleOtpChange(
														index,
														e.target.value,
													)
												}
												onKeyDown={(e) =>
													handleOtpKeyDown(
														index,
														e.key,
													)
												}
												onPaste={(e) => {
													e.preventDefault();
													handleOtpPaste(
														e.clipboardData.getData(
															"text",
														),
													);
												}}
											/>
										))}
									</OtpBoxes>
									{otpValidationMessage && (
										<FieldError $size={13}>
											{otpValidationMessage}
										</FieldError>
									)}
								</Stack>
								<Button
									$full
									$size="lg"
									$loading={loading}
									disabled={!isOtpComplete}
									onClick={verify}
								>
									Verify &amp; continue
								</Button>
								<Button
									$variant="ghost"
									$size="sm"
									onClick={() => {
										setSentToPhone("");
										setStep("phone");
									}}
								>
									Use a different number
								</Button>
							</Stack>
						)}
					</AuthCard>

					<Foot $muted $size={13}>
						Want to sell?{" "}
						<Link
							href="/sell"
							style={{
								color: "var(--pc-color-primary)",
								fontWeight: 700,
							}}
						>
							Apply as a vendor
						</Link>
					</Foot>
				</FadeIn>
			</Wrap>
		</Screen>
	);
}

function errMsg(e: unknown): string {
	const err = e as { response?: { data?: { message?: string } } };
	return err?.response?.data?.message ?? "Something went wrong. Try again.";
}

function getRecipientPhone(data: unknown): string | undefined {
	const res = data as { data?: { recipientPhone?: string } };
	return res.data?.recipientPhone;
}

function onlyDigits(value: string): string {
	return value.replace(/\D/g, "");
}

function isLocalPath(value: string | null): value is string {
	return !!value && value.startsWith("/") && !value.startsWith("//");
}

function isValidPhone(value: string): boolean {
	const nationalNumber = value.startsWith("0") ? value.slice(1) : "";
	return (
		/^\d{11}$/.test(value) &&
		/^(?:70[1-9]|80[1-9]|81\d|90[1-9]|91[2-6])\d{7}$/.test(nationalNumber)
	);
}
