"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
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

const CardTitle = styled.h2`
  margin: 0;
  font-size: clamp(1.5rem, 4vw, 2rem);
  font-weight: 800;
  color: var(--pc-color-text);
`;

const GoogleButtonContent = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
`;

const GoogleIcon = styled.span`
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 50%;
  background: #ffffff;
  color: #4285f4;
  font-weight: 900;
`;

const EmailButtonContent = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
`;

const EmailIcon = styled.span`
  color: var(--pc-color-primary);
  font-size: 1.35rem;
`;

const SellPrompt = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 24px;
`;

const SellButton = styled.button`
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--pc-color-primary);
  font: inherit;
  font-weight: 600;
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }
`;

const SellApplicationWrapper = styled.div`
  display: grid;
  width: 100%;
  min-height: min(680px, 80vh);
  place-items: center;
`;

const SellCard = styled.div`
  display: flex;
  width: min(100%, 520px);
  flex-direction: column;
  align-items: center;
  gap: 24px;
  padding: clamp(28px, 6vw, 48px);
  border: 1px solid var(--pc-color-border);
  border-radius: 28px;
  background:
    radial-gradient(circle at top, rgba(255, 94, 31, 0.12), transparent 42%),
    var(--pc-color-surface);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
  text-align: center;
`;

const SellMark = styled.div`
  display: grid;
  width: 78px;
  height: 78px;
  place-items: center;
  border-radius: 24px;
  background: linear-gradient(135deg, #ff5e1f, #ff9f0a);
  font-size: 2rem;
  box-shadow: 0 14px 34px rgba(255, 94, 31, 0.24);
`;

const SellTitle = styled.h1`
  margin: 0;
  font-size: clamp(1.8rem, 5vw, 2.5rem);
  font-weight: 850;
  color: var(--pc-color-text);
`;

const SellDescription = styled.p`
  max-width: 410px;
  margin: 0;
  color: var(--pc-color-text-muted);
  font-size: 1rem;
  line-height: 1.65;
`;

const BackButton = styled.button`
  border: 0;
  background: transparent;
  color: var(--pc-color-text-muted);
  font: inherit;
  font-weight: 700;
  cursor: pointer;

  &:hover {
    color: var(--pc-color-text);
  }
`;

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
  justify-self: center;
 
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
  const [authNext, setAuthNext] = useState(
    sellOpen ? "/vendor/settings" : next,
  );
  const [authView, setAuthView] = useState<"default" | "sell">("default");

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

  function setNextPath(path: string) {
    setAuthNext(path);
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

  return (
    <Screen>
      <Wrap>
        <FadeIn>
          {authView === "default" ? (
            <>
              <Brand>
                <Mark aria-hidden>🍲</Mark>

                <Stack $gap={2}>
                  <Title>Prechop</Title>

                  <Text $muted>Order before they cook.</Text>
                </Stack>
              </Brand>

              <AuthCard>
                <Stack $gap={18}>
                  <Stack $gap={6}>
                    <CardTitle>Continue to Prechop</CardTitle>

                    <Text $muted>Sign in to continue your order.</Text>
                  </Stack>

                  <Button $full $size="lg" onClick={continueWithGoogle}>
                    <GoogleButtonContent>
                      <GoogleIcon aria-hidden>G</GoogleIcon>

                      <span>Continue with Google</span>
                    </GoogleButtonContent>
                  </Button>

                  <Divider>or</Divider>

                  <Button
                    $full
                    $size="lg"
                    $variant="secondary"
                    onClick={() => {
                      setEmailOpen((current) => !current);
                      setSent(false);
                    }}>
                    <EmailButtonContent>
                      <EmailIcon aria-hidden>✉</EmailIcon>

                      <span>Continue with Email</span>
                    </EmailButtonContent>
                  </Button>

                  {emailOpen && (
                    <Panel>
                      <Stack $gap={12}>
                        <Input
                          label="Email address"
                          type="email"
                          value={email}
                          onChange={(event) => {
                            setEmail(event.target.value);
                            setSent(false);
                          }}
                          placeholder="you@example.com"
                          autoComplete="email"
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              continueWithEmail();
                            }
                          }}
                        />

                        <Button
                          $full
                          onClick={continueWithEmail}
                          $loading={loading}>
                          Send sign-in link
                        </Button>

                        {sent && (
                          <Text $muted $size={13}>
                            Check your email and open the secure link to
                            continue.
                          </Text>
                        )}
                      </Stack>
                    </Panel>
                  )}
                </Stack>
              </AuthCard>

              <SellPrompt>
                <Text $muted>Want to sell?</Text>

                <SellButton
                  type="button"
                  onClick={() => {
                    setAuthView("sell");
                    setEmailOpen(false);
                    setSent(false);
                  }}>
                  Sell on Prechop
                </SellButton>
              </SellPrompt>

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
            </>
          ) : (
            <SellApplicationWrapper>
              <SellCard>
                <SellMark aria-hidden>🍳</SellMark>

                <Stack $gap={10}>
                  <SellTitle>Sell on Prechop</SellTitle>

                  <SellDescription>
                    Continue with Google or email, then apply to become a vendor
                    from your Account.
                  </SellDescription>
                </Stack>

                <Button
                  $full
                  $size="lg"
                  onClick={() => {
                    setAuthView("default");

                    /*
                     * Keep the vendor intention so successful
                     * authentication returns the user directly
                     * to the vendor application.
                     */
                    setNextPath?.("/vendor/settings");
                  }}>
                  Continue
                </Button>

                <BackButton
                  type="button"
                  onClick={() => setAuthView("default")}>
                  Back
                </BackButton>
              </SellCard>
            </SellApplicationWrapper>
          )}
        </FadeIn>
      </Wrap>
    </Screen>
  );
}

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
