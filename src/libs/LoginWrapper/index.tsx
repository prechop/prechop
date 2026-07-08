"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import styled from "styled-components";
import {
	Button,
	Card,
	Container,
	Input,
	Select,
	Stack,
	Text,
	Title,
} from "@/components";
import { api } from "@/constants/api";
import { useAuth } from "@/hooks/Auth/useAuth";
import { useToast } from "@/hooks/useToast";
import type { Campus } from "@/types";

type Mode = "login" | "signup-buyer" | "signup-vendor";
type Step = "form" | "otp";

const Wrap = styled(Container)`
	max-width: 440px;
	padding-top: 48px;
	padding-bottom: 48px;
`;
const Tabs = styled.div`
	display: flex;
	gap: 6px;
	background: var(--pc-surface-2);
	padding: 4px;
	border-radius: var(--pc-radius);
	margin-bottom: 20px;
`;
const Tab = styled.button<{ $active: boolean }>`
	flex: 1;
	border: none;
	background: ${(p) => (p.$active ? "var(--pc-surface)" : "transparent")};
	color: ${(p) => (p.$active ? "var(--pc-color-primary)" : "var(--pc-text-muted)")};
	padding: 10px;
	border-radius: var(--pc-radius-sm);
	font-weight: 700;
	font-size: 14px;
	cursor: pointer;
	box-shadow: ${(p) => (p.$active ? "var(--pc-shadow)" : "none")};
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
		<Wrap>
			<Title $size={26} style={{ marginBottom: 4 }}>
				Welcome to Prechop
			</Title>
			<Text $muted style={{ marginBottom: 20 }}>
				Order before they cook.
			</Text>

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

			<Card>
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
									onChange={(e) => setEmail(e.target.value)}
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
								onChange={(e) => setCampusId(e.target.value)}
							>
								{campuses.map((c) => (
									<option key={c.id} value={c.id}>
										{c.name}
									</option>
								))}
							</Select>
						)}
						<Button $full $loading={loading} onClick={submitForm}>
							Send code
						</Button>
					</Stack>
				) : (
					<Stack $gap={14}>
						<Text $muted>
							Enter the 6-digit code sent to {phone}.
						</Text>
						<Input
							label="Verification code"
							value={otp}
							onChange={(e) => setOtp(e.target.value)}
							placeholder="123456"
							inputMode="numeric"
							maxLength={6}
						/>
						<Button $full $loading={loading} onClick={verify}>
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
			</Card>
		</Wrap>
	);
}

function errMsg(e: unknown): string {
	const err = e as { response?: { data?: { message?: string } } };
	return err?.response?.data?.message ?? "Something went wrong. Try again.";
}
