"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
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
import { useToast } from "@/hooks/useToast";

const Screen = styled.div`
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--pc-space-6) 0 var(--pc-space-8);
  background: var(--pc-gradient-mesh);
`;
const Wrap = styled(Container)`
  max-width: 500px;
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
const Title = styled.h1`
  font-family: var(--pc-font-display);
  font-size: clamp(28px, 6vw, 36px);
  font-weight: 800;
  letter-spacing: 0;
  color: var(--pc-text);
`;
const AuthCard = styled(Card)`
  padding: var(--pc-space-6);
  box-shadow: var(--pc-shadow-lg);
`;
const Divider = styled.div`
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 10px;
  color: var(--pc-text-muted);
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  &::before,
  &::after {
    content: "";
    height: 1px;
    background: var(--pc-border);
  }
`;
const Panel = styled.div`
  border: 1px solid var(--pc-border);
  border-radius: var(--pc-radius);
  background: var(--pc-surface-2);
  padding: var(--pc-space-4);
`;
const Foot = styled(Text)`
  text-align: center;
  margin-top: var(--pc-space-5);
`;

export default function LoginWrapper() {
  const params = useSearchParams();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [emailOpen, setEmailOpen] = useState(false);
  const [sellOpen, setSellOpen] = useState(params.get("intent") === "sell");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const next = useMemo(() => cleanNext(params.get("next")), [params]);
  const authNext = next;

  async function continueWithEmail() {
    if (!emailOpen) {
      setEmailOpen(true);
      setSellOpen(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api.post("/auth/email/request", {
        email,
        next: authNext,
      });
      const devLink = res.data?.data?.devLink;
      setSent(true);
      toast("Check your email for a secure sign-in link.", "success");
      if (devLink) {
        console.info("Prechop dev sign-in link:", devLink);
      }
    } catch (error) {
      toast(errMsg(error), "error");
    } finally {
      setLoading(false);
    }
  }

  function continueWithGoogle() {
    const query = new URLSearchParams({ next: authNext });
    window.location.href = `/api/auth/google/start?${query.toString()}`;
  }

  const router = useRouter(); // swap for your router's navigation hook

  return (
    <Screen>
      <Wrap>
        <FadeIn>
          <Brand>
            <Mark aria-hidden>🍲</Mark>
            <Stack $gap={2}>
              <Title>Prechop</Title>
              <Text $muted>Order before they cook.</Text>
            </Stack>
          </Brand>

          <AuthCard>
            <Stack $gap={14}>
              <Stack $gap={4}>
                <Title>Continue to Prechop</Title>
                <Text $muted>Sign in to continue your order.</Text>
              </Stack>

              <Button $full $size="lg" onClick={continueWithGoogle}>
                Continue with Google
              </Button>

              <Divider>OR</Divider>

              <Button
                $full
                $size="lg"
                $variant="secondary"
                onClick={continueWithEmail}
                $loading={loading}>
                Continue with Email
              </Button>

              {emailOpen && (
                <Panel>
                  <Stack $gap={12}>
                    <Input
                      label="Email"
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setSent(false);
                      }}
                      placeholder="you@example.com"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") continueWithEmail();
                      }}
                    />
                    {sent && (
                      <Text $muted $size={13}>
                        Open the link in your email to finish signing in. It
                        works for new and returning accounts.
                      </Text>
                    )}
                  </Stack>
                </Panel>
              )}
            </Stack>
          </AuthCard>

          <Foot $size={15}>
            <Text as="span" $muted>
              Want to sell?{" "}
            </Text>
            <Link
              href="/sell"
              onClick={(e) => {
                e.preventDefault();
                router.push("/sell");
              }}
              style={{
                color: "var(--pc-color-primary)",
                fontWeight: 700,
              }}>
              Sell on Prechop
            </Link>
          </Foot>

          <Foot $muted $size={13}>
            You can still browse{" "}
            <Link
              href="/marketplace"
              style={{
                color: "var(--pc-color-primary)",
                fontWeight: 700,
              }}>
              vendors and meals
            </Link>{" "}
            before signing in.
          </Foot>
        </FadeIn>
      </Wrap>
    </Screen>
  );
}

// 	return (
// 		<Screen>
// 			<Wrap>
// 				<FadeIn>
// 					<Brand>
// 						<Mark aria-hidden>🍲</Mark>
// 						<Stack $gap={2}>
// 							<Title>Continue to Prechop</Title>
// 							<Text $muted>
// 								One account for buying and selling.
// 							</Text>
// 						</Stack>
// 					</Brand>

// 					<AuthCard>
// 						<Stack $gap={14}>
// 							<Button
// 								$full
// 								$size="lg"
// 								onClick={continueWithGoogle}
// 							>
// 								Continue with Google
// 							</Button>

// 							<Divider>or</Divider>

// 							<Button
// 								$full
// 								$size="lg"
// 								$variant={emailOpen ? "secondary" : "primary"}
// 								onClick={continueWithEmail}
// 								$loading={loading}
// 							>
// 								Continue with email
// 							</Button>

// 							{emailOpen && (
// 								<Panel>
// 									<Stack $gap={12}>
// 										<Input
// 											label="Email"
// 											type="email"
// 											value={email}
// 											onChange={(e) => {
// 												setEmail(e.target.value);
// 												setSent(false);
// 											}}
// 											placeholder="you@example.com"
// 											onKeyDown={(e) => {
// 												if (e.key === "Enter")
// 													continueWithEmail();
// 											}}
// 										/>
// 										{sent && (
// 											<Text $muted $size={13}>
// 												Open the link in your email to
// 												finish signing in. It works for
// 												new and returning accounts.
// 											</Text>
// 										)}
// 									</Stack>
// 								</Panel>
// 							)}

// 							<Button
// 								$full
// 								$size="lg"
// 								$variant="ghost"
// 								onClick={() => {
// 									setSellOpen(true);
// 									setEmailOpen(false);
// 								}}
// 							>
// 								Sell on Prechop
// 							</Button>

// 							{sellOpen && (
// 								<Panel>
// 									<Stack $gap={12}>
// 										<Text $weight={800}>
// 											Use one Prechop account for buying
// 											and selling.
// 										</Text>
// 										<Text $muted $size={14}>
// 											Continue first, then we will take
// 											you directly to the vendor
// 											application and prefill your name
// 											and email.
// 										</Text>
// 										<Button
// 											$full
// 											onClick={() => {
// 												setSellOpen(false);
// 												setEmailOpen(true);
// 											}}
// 										>
// 											Continue to Prechop
// 										</Button>
// 									</Stack>
// 								</Panel>
// 							)}
// 						</Stack>
// 					</AuthCard>

// 					<Foot $muted $size={13}>
// 						You can still browse{" "}
// 						<Link
// 							href="/marketplace"
// 							style={{
// 								color: "var(--pc-color-primary)",
// 								fontWeight: 700,
// 							}}
// 						>
// 							vendors and meals
// 						</Link>{" "}
// 						before signing in.
// 					</Foot>
// 				</FadeIn>
// 			</Wrap>
// 		</Screen>
// 	);
// }

function errMsg(e: unknown): string {
  const err = e as { response?: { data?: { message?: string } } };
  return err?.response?.data?.message ?? "Something went wrong. Try again.";
}

function cleanNext(value: string | null): string {
  if (!value?.startsWith("/") || value.startsWith("//")) {
    return "/marketplace";
  }
  return value;
}
