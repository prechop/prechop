"use client";

import Link from "next/link";
import styled from "styled-components";
import {
	Badge,
	Button,
	Card,
	FadeIn,
	Row,
	Stack,
	Text,
	Title,
} from "@/components";
import { useAuth } from "@/hooks/Auth/useAuth";

export type PolicyAudience = "shared" | "public" | "buyer" | "vendor";
interface PolicySection {
	title: string;
	body: string[];
	audience?: PolicyAudience | PolicyAudience[];
}
interface PolicyPageProps {
	eyebrow: string;
	title: string;
	summary: string;
	sections: PolicySection[];
}

const Wrap = styled(Stack)`max-width:860px;margin:0 auto;`;
const Hero = styled(Card)`background:var(--pc-surface);`;
const SectionGrid = styled.div`display:grid;grid-template-columns:minmax(0,1fr);gap:12px;`;
const PolicyCard = styled(Card)`padding:var(--pc-space-5);`;
const PolicyList = styled.ul`margin:0;padding-left:18px;color:var(--pc-text-muted);line-height:1.65;font-size:14px;`;
const LinkGrid = styled.div`display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;`;
const MAIN_LINKS = [
	["Help", "/help"],
	["Privacy", "/privacy"],
	["Terms", "/terms"],
] as const;
const POLICY_LINKS = [
	["Payments and Payouts", "/policies/payments-and-settlement"],
	["Cancellation and Refunds", "/policies/cancellation-and-refunds"],
	["Pickup and Delivery", "/policies/pickup-and-delivery"],
	["No-show", "/policies/buyer-no-show"],
	["Disputes", "/policies/disputes"],
] as const;

export default function PolicyPageContent({
	eyebrow,
	title,
	summary,
	sections,
}: PolicyPageProps) {
	const { isAuthenticated, inGroup } = useAuth();
	const audience: Exclude<PolicyAudience, "shared"> = !isAuthenticated
		? "public"
		: inGroup("Vendors")
			? "vendor"
			: "buyer";
	const visibleSections = sections.filter((section) => {
		const allowed: PolicyAudience[] = section.audience
			? Array.isArray(section.audience)
				? section.audience
				: [section.audience]
			: ["shared"];
		return allowed.includes("shared") || allowed.includes(audience);
	});
	const relatedLinks = isAuthenticated
		? [...MAIN_LINKS, ...POLICY_LINKS]
		: MAIN_LINKS;
	return (
		<FadeIn>
			<Wrap $gap={18}>
				<Hero>
					<Stack $gap={12}>
						<Row $justify="space-between" $align="flex-start" $wrap>
							<Stack $gap={6}>
								<Badge $tone="primary">{eyebrow}</Badge>
								<Title $size={32}>{title}</Title>
							</Stack>
							<Button
								as={Link}
								href="/help"
								$variant="secondary"
								$size="sm"
							>
								Help
							</Button>
						</Row>
						<Text $muted>{summary}</Text>
					</Stack>
				</Hero>
				<SectionGrid>
					{visibleSections.map((section) => (
						<PolicyCard key={section.title}>
							<Stack $gap={10}>
								<Title $size={20}>{section.title}</Title>
								<PolicyList>
									{section.body.map((line) => (
										<li key={line}>{line}</li>
									))}
								</PolicyList>
							</Stack>
						</PolicyCard>
					))}
				</SectionGrid>
				<Card>
					<Stack $gap={10}>
						<Text $weight={800}>Related pages</Text>
						<LinkGrid>
							{relatedLinks.map(([label, href]) => (
								<Button
									key={href}
									as={Link}
									href={href}
									$variant="secondary"
									$size="sm"
									aria-label={`Open ${label}`}
								>
									{label}
								</Button>
							))}
						</LinkGrid>
					</Stack>
				</Card>
			</Wrap>
		</FadeIn>
	);
}
