"use client";

import Link from "next/link";
import styled from "styled-components";
import { Button, Card, Container, FadeIn, Stack, Text } from "@/components";

const Screen = styled.div`
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--pc-space-6) 0 var(--pc-space-8);
  background: var(--pc-gradient-mesh);
`;

const Wrap = styled(Container)`
  max-width: 520px;
`;

const Panel = styled(Card)`
  padding: var(--pc-space-6);
  box-shadow: var(--pc-shadow-lg);
`;

const Mark = styled.div`
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border-radius: var(--pc-radius);
  background: var(--pc-color-primary-50);
  color: var(--pc-color-primary);
  font-size: 28px;
  font-weight: 800;
`;

const Title = styled.h1`
  font-family: var(--pc-font-display);
  font-size: 28px;
  font-weight: 800;
  color: var(--pc-text);
  letter-spacing: -0.03em;
`;

export default function BuyerAccountExistsPage() {
  return (
    <Screen>
      <Wrap>
        <FadeIn>
          <Panel>
            <Stack $gap={16}>
              <Mark aria-hidden>!</Mark>
              <Stack $gap={8}>
                <Title>You already have a PreChop account</Title>
                <Text $muted>
                  A buyer account is already registered with this phone number.
                  You cannot create a separate vendor account. To become a
                  vendor, log into your existing account and apply from your
                  profile settings.
                </Text>
              </Stack>
              <Link href="/login">
                <Button $size="lg" $full>
                  Log in to upgrade
                </Button>
              </Link>
              <Link href="/sell">
                <Button $variant="ghost" $full>
                  Try a different number
                </Button>
              </Link>
            </Stack>
          </Panel>
        </FadeIn>
      </Wrap>
    </Screen>
  );
}
