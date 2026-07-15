"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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

type Step = "form" | "otp";

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
	font-size: clamp(26px, 6vw, 32px);
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

/**
 * Vendor application ("Sell on Prechop"). Separate from the unified login: a
 * vendor supplies their business details, which creates an INCOMPLETE vendor
 * account, then verifies an OTP and lands on the vendor dashboard to finish
 * onboarding. Buyers never see this — they just log in.
 */
export default function SellApplicationWrapper() {
	const router = useRouter();
	const { refresh } = useAuth();
	const { toast } = useToast();

	const [step, setStep] = useState<Step>("form");
	const [loading, setLoading] = useState(false);

	const [firstName, setFirstName] = useState("");
	const [lastName, setLastName] = useState("");
	const [businessName, setBusinessName] = useState("");
	const [email, setEmail] = useState("");
	const [phone, setPhone] = useState("");
	const [otp, setOtp] = useState("");

	async function submit() {
		if (!firstName.trim() || !businessName.trim() || !phone.trim()) {
			toast("Fill in your name, business and phone", "error");
			return;
		}
		setLoading(true);
		try {
			await api.post("/auth/register/vendor", {
				firstName: firstName.trim(),
				lastName: lastName.trim(),
				phone: phone.trim(),
				email: email.trim(),
				businessName: businessName.trim(),
			});
			toast("Code sent to your phone", "success");
			setStep("otp");
		} catch (e) {
			if (appCode(e) === "BUYER_ACCOUNT_EXISTS") {
				router.replace("/sell/account-exists");
				return;
			}
			toast(errMsg(e), "error");
		} finally {
			setLoading(false);
		}
	}

	async function verify() {
		setLoading(true);
		try {
			await api.post("/auth/otp/verify", { phone: phone.trim(), otp });
			await refresh();
			router.replace("/dashboard");
		} catch (e) {
			toast(errMsg(e), "error");
		} finally {
			setLoading(false);
		}
	}

	return (
		<Screen>
			<Wrap>
				<FadeIn>
					<Brand>
						<Mark aria-hidden>🍳</Mark>
						<Stack $gap={2}>
							<Wordmark>Sell on Prechop</Wordmark>
							<Text $muted>Cook only to confirmed orders.</Text>
						</Stack>
					</Brand>

					<AuthCard>
						{step === "form" ? (
							<Stack $gap={14}>
								<Input
									label="First name"
									value={firstName}
									onChange={(e) =>
										setFirstName(e.target.value)
									}
									placeholder="Ada"
								/>
								<Input
									label="Last name"
									value={lastName}
									onChange={(e) =>
										setLastName(e.target.value)
									}
									placeholder="Obi"
								/>
								<Input
									label="Business name"
									value={businessName}
									onChange={(e) =>
										setBusinessName(e.target.value)
									}
									placeholder="Ada's Kitchen"
								/>
								<Input
									label="Email"
									type="email"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									placeholder="you@example.com"
								/>
								<Input
									label="Phone number"
									value={phone}
									onChange={(e) => setPhone(e.target.value)}
									placeholder="08012345678"
									inputMode="tel"
								/>
								<Button
									$full
									$size="lg"
									$loading={loading}
									onClick={submit}
								>
									Apply &amp; send code
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
										Enter the 6-digit code sent to {phone}.
									</Text>
								</Stack>
								<Input
									label="Verification code"
									value={otp}
									onChange={(e) => setOtp(e.target.value)}
									placeholder="123456"
									inputMode="numeric"
									maxLength={6}
								/>
								<Button
									$full
									$size="lg"
									$loading={loading}
									onClick={verify}
								>
									Verify &amp; continue
								</Button>
								<Button
									$variant="ghost"
									$size="sm"
									onClick={() => setStep("form")}
								>
									Change details
								</Button>
							</Stack>
						)}
					</AuthCard>

					<Foot $muted $size={13}>
						Already have an account?{" "}
						<Link
							href="/login"
							style={{
								color: "var(--pc-color-primary)",
								fontWeight: 700,
							}}
						>
							Log in
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

function appCode(e: unknown): string | undefined {
	const err = e as { response?: { data?: { appCode?: string } } };
	return err?.response?.data?.appCode;
}
