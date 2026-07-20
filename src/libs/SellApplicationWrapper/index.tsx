"use client";

import { useRouter } from "next/navigation";
import styled from "styled-components";
import { Button, Card, Container, FadeIn, Stack, Text } from "@/components";
import { useAuth } from "@/hooks/Auth/useAuth";

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
const Mark = styled.div`
  width: 60px;
  height: 60px;
  display: grid;
  place-items: center;
  font-size: 30px;
  border-radius: var(--pc-radius-lg);
  background: var(--pc-gradient-hero);
  box-shadow: var(--pc-shadow-primary);
  margin: 0 auto;
`;
const Wordmark = styled.h1`
  font-family: var(--pc-font-display);
  font-size: clamp(26px, 6vw, 34px);
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--pc-text);
  text-align: center;
`;
const Shell = styled(Card)`
  padding: var(--pc-space-6);
  box-shadow: var(--pc-shadow-lg);
`;

export default function SellApplicationWrapper() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  return (
    <Screen>
      <Wrap>
        <FadeIn>
          <Shell>
            <Stack $gap={18}>
              <Mark aria-hidden>🍳</Mark>
              <Stack $gap={6} style={{ textAlign: "center" }}>
                <Wordmark>Sell on Prechop</Wordmark>
                <Text $muted>
                  You need one Prechop account for both buying and selling.
                  Continue first, then we'll take you directly to the vendor
                  onboarding and prefill your name and email.
                </Text>
              </Stack>
              <Button
                $full
                $size="lg"
                onClick={() =>
                  router.push(
                    isAuthenticated
                      ? "/vendor/onboarding"
                      : "/login?next=/vendor/onboarding&intent=sell",
                  )
                }>
                Continue to Prechop
              </Button>
            </Stack>
          </Shell>
        </FadeIn>
      </Wrap>
    </Screen>
  );
}
