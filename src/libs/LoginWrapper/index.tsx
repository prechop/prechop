"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import styled from "styled-components";
import {
	Button,
	Card,
	Container,
	FadeIn,
	Input,
	Select,
	Stack,
	Text,
} from "@/components";
import { api } from "@/constants/api";
import { useAuth } from "@/hooks/Auth/useAuth";
import { useToast } from "@/hooks/useToast";
import type { Campus } from "@/types";

type Mode = "login" | "signup-buyer" | "signup-vendor";
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
	font-size: clamp(28px, 6vw, 34px);
	font-weight: 800;
	letter-spacing: -0.03em;
	color: var(--pc-text);
`;
const AuthCard = styled(Card)`
	padding: var(--pc-space-6);
	box-shadow: var(--pc-shadow-lg);
`;
const Tabs = styled.div`
	display: flex;
	gap: 4px;
	background: var(--pc-surface-2);
	padding: 5px;
	border-radius: var(--pc-radius-pill);
	margin-bottom: var(--pc-space-5);
`;
const Tab = styled.button<{ $active: boolean }>`
	flex: 1;
	border: none;
	background: ${(p) => (p.$active ? "var(--pc-surface)" : "transparent")};
	color: ${(p) => (p.$active ? "var(--pc-color-primary)" : "var(--pc-text-muted)")};
	padding: 10px;
	border-radius: var(--pc-radius-pill);
	font-family: var(--pc-font-display);
	font-weight: 700;
	font-size: 14px;
	cursor: pointer;
	box-shadow: ${(p) => (p.$active ? "var(--pc-shadow)" : "none")};
	transition: color var(--pc-dur) var(--pc-ease), background var(--pc-dur) var(--pc-ease);
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

export default function LoginWrapper() {
	const router = useRouter();
	const params = useSearchParams();
	const { refresh } = useAuth();
	const { toast } = useToast();

	const [mode, setMode] = useState<Mode>(
		params.get("intent") === "vendor" ? "signup-vendor" : "login",
	);
	const [step, setStep] = useState<Step>("form");
	const [loading, setLoading] = useState(false);
	const [campuses, setCampuses] = useState<Campus[]>([]);

	const [firstName, setFirstName] = useState("");
	const [lastName, setLastName] = useState("");
	const [phone, setPhone] = useState("");
	const [email, setEmail] = useState("");
	const [businessName, setBusinessName] = useState("");
	const [campusId, setCampusId] = useState("");
	const [otp, setOtp] = useState("");

	useEffect(() => {
		api.get("/campuses")
			.then((r) => {
				const list = (r.data?.data ?? []) as Campus[];
				setCampuses(list);
				if (list[0]) setCampusId((c) => c || list[0].id);
			})
			.catch(() => {});
	}, []);

	async function submitForm() {
		setLoading(true);
		try {
			if (mode === "login") {
				await api.post("/auth/otp/request", { phone });
			} else if (mode === "signup-buyer") {
				await api.post("/auth/register/buyer", {
					firstName,
					lastName,
					phone,
					campusId,
				});
			} else {
				await api.post("/auth/register/vendor", {
					firstName,
					lastName,
					phone,
					campusId,
					email,
					businessName,
				});
			}
			toast("Code sent to your phone", "success");
			setStep("otp");
		} catch (e) {
			toast(errMsg(e), "error");
		} finally {
			setLoading(false);
		}
	}

	async function verify() {
		setLoading(true);
		try {
			const res = await api.post("/auth/otp/verify", { phone, otp });
			const role = res.data?.data?.user?.role as string;
			await refresh();
			const next = params.get("next");
			if (next) router.replace(next);
			else if (role === "VENDOR") router.replace("/dashboard");
			else if (role === "SUPER_ADMIN") router.replace("/admin");
			else router.replace("/marketplace");
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
						<Mark aria-hidden>🍲</Mark>
						<Stack $gap={2}>
							<Wordmark>Prechop</Wordmark>
							<Text $muted>Order before they cook.</Text>
						</Stack>
					</Brand>

					<AuthCard>
						<Tabs>
							<Tab
								$active={mode === "login"}
								onClick={() => {
									setMode("login");
									setStep("form");
								}}
							>
								Log in
							</Tab>
							<Tab
								$active={mode === "signup-buyer"}
								onClick={() => {
									setMode("signup-buyer");
									setStep("form");
								}}
							>
								Buyer
							</Tab>
							<Tab
								$active={mode === "signup-vendor"}
								onClick={() => {
									setMode("signup-vendor");
									setStep("form");
								}}
							>
								Vendor
							</Tab>
						</Tabs>

						{step === "form" ? (
							<Stack $gap={14}>
								{mode !== "login" && (
									<>
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
									</>
								)}
								{mode === "signup-vendor" && (
									<>
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
											onChange={(e) =>
												setEmail(e.target.value)
											}
											placeholder="you@example.com"
										/>
									</>
								)}
								<Input
									label="Phone number"
									value={phone}
									onChange={(e) => setPhone(e.target.value)}
									placeholder="08012345678"
									inputMode="tel"
								/>
								{mode !== "login" && (
									<Select
										label="Campus"
										value={campusId}
										onChange={(e) =>
											setCampusId(e.target.value)
										}
									>
										{campuses.map((c) => (
											<option key={c.id} value={c.id}>
												{c.name}
											</option>
										))}
									</Select>
								)}
								<Button
									$full
									$size="lg"
									$loading={loading}
									onClick={submitForm}
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
						Fresh campus kitchens, ready when you are.
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
