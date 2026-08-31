"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import styled from "styled-components";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Container,
  Stack,
  Text,
} from "@/components";
import { useAuth } from "@/hooks/Auth/useAuth";

const Page = styled.div`
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--pc-gradient-mesh), var(--pc-bg);
`;
/* Keyboard/SR users land here first and can jump straight past the header into
   the hero. Off-screen until focused, then it pins to the top-left. */
const SkipLink = styled.a`
  position: absolute;
  left: 12px;
  top: -80px;
  z-index: 200;
  padding: 10px 16px;
  border-radius: var(--pc-radius-sm);
  background: var(--pc-surface);
  color: var(--pc-text);
  border: 1px solid var(--pc-border);
  box-shadow: var(--pc-shadow);
  font-weight: 700;
  font-size: 14px;
  transition: top var(--pc-dur) var(--pc-ease);
  &:focus-visible {
    top: 12px;
    outline: 2px solid var(--pc-color-primary);
    outline-offset: 2px;
  }
`;
const Nav = styled(Container)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 72px;
`;
const Brand = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-family: var(--pc-font-display);
  font-weight: 800;
  font-size: 23px;
  letter-spacing: -0.03em;
  color: var(--pc-text);
`;
const Logo = styled.span`
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  // background: var(--pc-gradient-warm);
  box-shadow: var(--pc-shadow-primary);
  font-size: 18px;
`;
const Hero = styled(Container)`
  flex: 1;
  display: grid;
  grid-template-columns: 1.05fr 0.95fr;
  align-items: center;
  gap: var(--pc-space-8);
  padding-top: var(--pc-space-6);
  padding-bottom: var(--pc-space-10);
  @media (max-width: 900px) {
    grid-template-columns: 1fr;
    gap: var(--pc-space-6);
  }
`;
const Copy = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 22px;
  max-width: 620px;
  animation: pc-fade-up 0.5s var(--pc-ease) both;
`;
const Kicker = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--pc-surface);
  border: 1px solid var(--pc-border);
  box-shadow: var(--pc-shadow-sm);
  color: var(--pc-text);
  font-weight: 700;
  font-size: 13px;
  padding: 7px 14px;
  border-radius: var(--pc-radius-pill);
  b {
    color: var(--pc-color-primary-ink);
  }
`;
const H1 = styled.h1`
  font-family: var(--pc-font-display);
  font-size: clamp(40px, 7vw, 68px);
  font-weight: 800;
  letter-spacing: -0.04em;
  line-height: 1.02;
  em {
    font-style: normal;
    background: var(--pc-gradient-warm);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
`;
const Lead = styled.p`
  font-size: 19px;
  line-height: 1.55;
  color: var(--pc-text-muted);
  max-width: 540px;
`;
const CTAs = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
`;
const Points = styled.ul`
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 10px 20px;
  li {
    display: flex;
    gap: 9px;
    align-items: center;
    font-weight: 600;
    font-size: 14.5px;
    color: var(--pc-text);
  }
  li span {
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--pc-color-accent-50);
    color: var(--pc-color-accent);
    font-size: 12px;
    font-weight: 800;
  }
`;
const Visual = styled.div`
  position: relative;
  min-height: 460px;
  @media (max-width: 900px) {
    min-height: 320px;
  }
`;
const Plate = styled.div`
  position: absolute;
  inset: 6% 4%;
  border-radius: var(--pc-radius-xl);
  background: var(--pc-gradient-hero);
  box-shadow: var(--pc-shadow-lg);
  overflow: hidden;
  display: grid;
  place-items: center;
  font-size: clamp(120px, 22vw, 220px);
  filter: saturate(1.05);
  animation: pc-fade-in 0.7s var(--pc-ease) both;
  &::after {
    content: "";
    position: absolute;
    inset: 0;
    background: radial-gradient(
      400px 300px at 30% 20%,
      rgba(255, 255, 255, 0.35),
      transparent 60%
    );
  }
`;
const FloatCard = styled.div<{ $pos: string; $delay: number }>`
  position: absolute;
  ${(p) => p.$pos}
  background: var(--pc-surface);
  border: 1px solid var(--pc-border);
  border-radius: var(--pc-radius);
  box-shadow: var(--pc-shadow-lg);
  padding: 12px 15px;
  display: flex;
  align-items: center;
  gap: 11px;
  animation: pc-fade-up 0.6s var(--pc-ease) both;
  animation-delay: ${(p) => p.$delay}ms;
  strong {
    font-size: 14px;
    font-weight: 800;
    letter-spacing: -0.02em;
  }
  small {
    font-size: 12px;
    color: var(--pc-text-muted);
    font-weight: 600;
  }
  .emoji {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border-radius: 11px;
    font-size: 20px;
  }
`;
const Footer = styled(Container)`
  padding: var(--pc-space-5) var(--pc-space-4);
  color: var(--pc-text-muted);

  margin-top: 5px;
  font-size: 13px;
  font-weight: 600;
  border-top: 1px solid var(--pc-border);
`;
const Info = styled(Container)`
  padding-top: var(--pc-space-2);
  padding-bottom: var(--pc-space-10);
`;
const InfoHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 680px;
  margin-bottom: var(--pc-space-5);
  h2 {
    font-family: var(--pc-font-display);
    font-size: clamp(30px, 4vw, 42px);
    line-height: 1.08;
    letter-spacing: -0.03em;
  }
  p {
    color: var(--pc-text-muted);
    font-size: 16px;
    line-height: 1.55;
  }
`;
const InfoGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;
const InfoCard = styled.section`
  background: var(--pc-surface);
  border: 1px solid var(--pc-border);
  border-radius: var(--pc-radius);
  box-shadow: var(--pc-shadow-sm);
  padding: var(--pc-space-5);
  h3 {
    font-family: var(--pc-font-display);
    font-size: 22px;
    margin-bottom: 12px;
  }
  p {
    color: var(--pc-text-muted);
    line-height: 1.55;
    font-size: 14px;
  }
`;
const StepList = styled.ol`
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 10px;
  li {
    display: grid;
    grid-template-columns: 30px 1fr;
    gap: 10px;
    align-items: start;
  }
  span {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--pc-color-primary-50);
    color: var(--pc-color-primary);
    font-weight: 800;
    font-size: 13px;
  }
  strong {
    display: block;
    font-size: 14px;
    margin-bottom: 2px;
  }
  small {
    color: var(--pc-text-muted);
    font-size: 13px;
    line-height: 1.45;
  }
`;
const AuthCluster = styled.div`
  /* Reserve the row height so the nav never jumps while auth resolves or
     between the logged-out and logged-in states. */
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--pc-surface);
  min-height: 40px;
`;

const _SingleKitchenSection = styled(Container)`
  padding-top: var(--pc-space-6);
  padding-bottom: var(--pc-space-10);
`;
const _SingleKitchenKicker = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--pc-surface);
  border: 1px solid var(--pc-border);
  box-shadow: var(--pc-shadow-sm);
  color: var(--pc-text);
  font-weight: 700;
  font-size: 13px;
  padding: 7px 14px;
  border-radius: var(--pc-radius-pill);
  width: fit-content;
`;
const _SingleKitchenTitle = styled.h1`
  font-family: var(--pc-font-display);
  font-size: clamp(32px, 5vw, 48px);
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.08;
  color: var(--pc-text);
`;
const _SingleKitchenSubtitle = styled.p`
  color: var(--pc-text-muted);
  font-size: 16px;
  line-height: 1.55;
`;
const _SingleKitchenCardWrap = styled.div`
  max-width: 520px;
`;
const _SingleKitchenHero = styled(Container)`
  flex: 1;
  display: grid;
  grid-template-columns: 1.05fr 0.95fr;
  align-items: center;
  gap: var(--pc-space-8);
  padding-top: var(--pc-space-6);
  padding-bottom: var(--pc-space-10);
  @media (max-width: 900px) {
    grid-template-columns: 1fr;
    gap: var(--pc-space-6);
  }
`;
const _SingleKitchenCopy = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 22px;
  max-width: 620px;
  animation: pc-fade-up 0.5s var(--pc-ease) both;
`;

/** Auth-aware nav control: reflects whether the visitor is signed in. */
function HeaderAuth() {
  const { user, isLoading, isAuthenticated } = useAuth();

  // Don't flash "Log in" before we know — just hold the space.
  if (isLoading) return <AuthCluster aria-hidden />;

  if (!isAuthenticated) {
    return (
      <AuthCluster as="nav" aria-label="Account">
        <Button as={Link} href="/login" $variant="ghost" $size="sm" $pill>
          Log in
        </Button>
      </AuthCluster>
    );
  }

  const isVendor = !!user?.groups?.includes("Vendors");
  const primaryHref = isVendor ? "/dashboard" : "/my-orders";
  const primaryLabel = isVendor ? "Dashboard" : "My orders";
  const fullName = user
    ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
    : undefined;

  return (
    <AuthCluster as="nav" aria-label="Account">
      <Button as={Link} href={primaryHref} $variant="ghost" $size="sm" $pill>
        {primaryLabel}
      </Button>
      <Link href="/account" aria-label="Your account">
        <Avatar name={fullName} size={38} />
      </Link>
    </AuthCluster>
  );
}

function _KitchenCard({ row }: { row: any }) {
  const vendor = row?.vendor ?? row;
  const listings = row?.listings ?? [];
  const firstListing = listings[0];
  const menuCount = listings.reduce(
    (sum: number, l: any) => sum + (l?.items?.length ?? 0),
    0,
  );
  const imageUrl =
    vendor?.profileImageUrl ??
    firstListing?.items?.[0]?.imageUrl ??
    null;
  const vendorId = vendor?.id ?? row?.vendorId;
  const businessName = vendor?.businessName ?? "Our kitchen";
  const isOpen = vendor?.isOpenForOrders ?? false;
  const rating = vendor?.rating ?? null;
  const totalReviews = vendor?.totalReviews ?? 0;
  const deliveryAvailable =
    firstListing?.deliveryAvailable ??
    listings.some((l: any) => l?.deliveryAvailable);
  const pickupAvailable =
    firstListing?.pickupAvailable ??
    listings.some((l: any) => l?.pickupAvailable);

  return (
    <Card $pad={0} as={Link} href={vendorId ? `/v/${vendorId}` : "/marketplace"}>
      <div
        style={{
          height: 220,
          background:
            imageUrl
              ? `center / cover no-repeat url(${imageUrl})`
              : "linear-gradient(135deg, var(--pc-color-gold) 0%, var(--pc-color-primary) 100%)",
          borderRadius: "18px 18px 0 0",
        }}
      />
      <Stack $gap={12} style={{ padding: 18 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}>
          <Text $weight={800} $size={18}>
            {businessName}
          </Text>
          {vendor?.verified ? (
            <Badge $tone="success">Verified</Badge>
          ) : null}
          <Badge $tone={isOpen ? "success" : "muted"}>
            {isOpen ? "Open now" : "Closed"}
          </Badge>
        </div>
        <Stack $gap={6}>
          <Text $muted $size={13}>
            {rating != null && totalReviews > 0
              ? `Rated ${rating.toFixed(1)} (${totalReviews} reviews)`
              : "New kitchen — no reviews yet"}
          </Text>
          <Text $muted $size={13}>
            {menuCount > 0
              ? `${menuCount} menu item${menuCount === 1 ? "" : "s"} available`
              : "No menus available"}
          </Text>
          <Text $muted $size={13}>
            {deliveryAvailable && pickupAvailable
              ? "Delivery / Pickup"
              : deliveryAvailable
                ? "Delivery"
                : pickupAvailable
                  ? "Pickup"
                  : "Menu, prices and ratings"}
          </Text>
        </Stack>
        <Button as="span" $pill $size="sm" style={{ marginTop: 4 }}>
          View kitchen →
        </Button>
      </Stack>

    </Card>
  );
}

export default function LandingPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const [platformMode, setPlatformMode] = useState<"MARKETPLACE" | "SINGLE_KITCHEN">(
    "MARKETPLACE",
  );

  useEffect(() => {
    let cancelled = false;
    async function loadPlatformMode() {
      try {
        const res = await fetch("/api/site-configs/marketplace", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const mode = data?.data?.platformMode;
        setPlatformMode(mode ?? "MARKETPLACE");
      } catch {
        // ignore
      }
    }
    loadPlatformMode();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (platformMode === "SINGLE_KITCHEN") {
      router.replace("/marketplace");
    }
  }, [platformMode, router]);

  if (isLoading) return null;

  const isSingleKitchen = platformMode === "SINGLE_KITCHEN";

  return (
    <Page>
      <SkipLink href="#main-content">Skip to content</SkipLink>
      <Nav as="header">
        <Brand>
          {/* <Logo aria-hidden>🍲</Logo> */}
          <Logo aria-hidden>
            <img src="/dark.png" alt="Prechop" />
          </Logo>
          Prechop
        </Brand>
        <HeaderAuth />
      </Nav>
      {isSingleKitchen ? null : (
        <Hero as="main" id="main-content">
          <Copy>
            <Kicker>
              <span aria-hidden>⏱️</span> Order <b>before</b> they cook
            </Kicker>
            <H1>
              Skip the queue.
              <br />
              <em>Reserve your meal.</em>
            </H1>
            <Lead>
              Browse today&apos;s campus kitchens, reserve your meal, and pay
              upfront. Pick up hot &mdash; or choose hostel delivery&mdash;without
              worrying about sold-out food.
            </Lead>
            <CTAs>
              <Button as={Link} href="/marketplace" $size="lg" $pill>
                Browse food 🍛
              </Button>
              <Button
                as={Link}
                href={
                  isAuthenticated
                    ? "/vendor/onboarding"
                    : "/login?next=/vendor/onboarding"
                }
                $size="lg"
                $variant="secondary"
                $pill>
                Become a vendor
              </Button>
            </CTAs>

            <Points>
              <li>
                <span>✓</span> Secure Paystack checkout
              </li>
              <li>
                <span>✓</span> Live cutoff timers
              </li>
              <li>
                <span>✓</span> Pickup or hostel delivery
              </li>
            </Points>
          </Copy>
          <Visual aria-hidden>
            {/* <Plate>🍲</Plate> */}
            <Plate>
              <img src="/img-2.png" alt="" aria-hidden />
            </Plate>
            <FloatCard $pos="top: 4%; left: -4%;" $delay={220}>
              <span
                className="emoji"
                style={{ background: "var(--pc-color-accent-50)" }}>
                ✅
              </span>
              <div>
                <strong>Order confirmed</strong>
                <br />
                <small>Ready by 1:30 PM</small>
              </div>
            </FloatCard>
            <FloatCard $pos="bottom: 8%; right: -4%;" $delay={380}>
              <span
                className="emoji"
                style={{ background: "var(--pc-color-gold-50)" }}>
                🔥
              </span>
              <div>
                <strong>Now cooking</strong>
                <br />
                <small>Jollof &amp; grilled chicken</small>
              </div>
            </FloatCard>
          </Visual>
        </Hero>
      )}
      <Info aria-label="Help and information">
        <InfoHeader>
          <h2>How Prechop works</h2>
          <p>
            Prechop helps buyers reserve food before it sells out and helps
            campus kitchens cook only for confirmed orders.
          </p>
        </InfoHeader>
        <InfoGrid>
          <InfoCard>
            <h3>How it works</h3>
            <StepList>
              <li>
                <span>1</span>
                <div>
                  <strong>Choose your meal</strong>
                  <small>Pick items, options, pickup or delivery.</small>
                </div>
              </li>
              <li>
                <span>2</span>
                <div>
                  <strong>Pick your delivery window</strong>
                  <small>Select a time that works for you.</small>
                </div>
              </li>
              <li>
                <span>3</span>
                <div>
                  <strong>Pay &amp; reserve</strong>
                  <small>Payment confirms your slot with the kitchen.</small>
                </div>
              </li>
              <li>
                <span>4</span>
                <div>
                  <strong>Receive your order</strong>
                  <small>Track cooking status, then pick up or receive delivery.</small>
                </div>
              </li>
            </StepList>
          </InfoCard>
          <InfoCard>
            <h3>Pay for Me</h3>
            <p>
              Choose Pay for Me at checkout to create a secure payment link.
              Send it to a parent, friend or sponsor; once they pay through
              Paystack, your original order is confirmed automatically.
            </p>
          </InfoCard>
        </InfoGrid>
      </Info>
      <Footer as="footer">
        © {new Date().getFullYear()} Prechop · Campus food, pre-ordered.
      </Footer>
    </Page>
  );
}
