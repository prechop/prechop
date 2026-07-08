"use client";

import Link from "next/link";
import styled from "styled-components";
import { Button, Container } from "@/components";

const Hero = styled.section`
	min-height: 100dvh;
	display: flex;
	flex-direction: column;
`;
const Nav = styled(Container)`
	display: flex;
	align-items: center;
	justify-content: space-between;
	height: 64px;
`;
const Brand = styled.span`
	font-weight: 800;
	font-size: 22px;
	color: var(--pc-color-primary);
`;
const Body = styled(Container)`
	flex: 1;
	display: flex;
	flex-direction: column;
	justify-content: center;
	align-items: flex-start;
	gap: 20px;
	padding-top: 40px;
	padding-bottom: 64px;
	max-width: 760px;
`;
const Kicker = styled.span`
	background: var(--pc-color-primary-50);
	color: var(--pc-color-primary);
	font-weight: 700;
	font-size: 13px;
	padding: 6px 12px;
	border-radius: 999px;
`;
const H1 = styled.h1`
	font-size: clamp(36px, 7vw, 60px);
	font-weight: 800;
	letter-spacing: -0.03em;
	line-height: 1.05;
`;
const Lead = styled.p`
	font-size: 18px;
	color: var(--pc-text-muted);
	max-width: 540px;
`;
const CTAs = styled.div`
	display: flex;
	gap: 12px;
	flex-wrap: wrap;
`;
const Points = styled.ul`
	margin: 24px 0 0;
	padding: 0;
	list-style: none;
	display: grid;
	gap: 10px;
	color: var(--pc-text);
	li { display: flex; gap: 10px; align-items: center; font-weight: 500; }
	li span { color: var(--pc-color-accent); }
`;

export default function LandingPage() {
	return (
		<Hero>
			<Nav>
				<Brand>Prechop</Brand>
				<Link href="/login">
					<Button $variant="ghost" $size="sm">
						Log in
					</Button>
				</Link>
			</Nav>
			<Body>
				<Kicker>Order before they cook</Kicker>
				<H1>Reserve your campus meal ahead of the queue.</H1>
				<Lead>
					Browse today&apos;s kitchens, pay upfront, and skip the
					wait. Vendors cook to confirmed orders — no more sold-out
					disappointment.
				</Lead>
				<CTAs>
					<Link href="/marketplace">
						<Button $size="lg">Browse food</Button>
					</Link>
					<Link href="/login?intent=vendor">
						<Button $size="lg" $variant="secondary">
							Sell on Prechop
						</Button>
					</Link>
				</CTAs>
				<Points>
					<li>
						<span>✓</span> Pay securely with Paystack
					</li>
					<li>
						<span>✓</span> Live cutoff timers — order before it
						closes
					</li>
					<li>
						<span>✓</span> Pickup or delivery to your hostel
					</li>
				</Points>
			</Body>
		</Hero>
	);
}
