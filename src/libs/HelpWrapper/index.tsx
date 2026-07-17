"use client";

import { useMemo, useState } from "react";
import styled from "styled-components";
import useSWR from "swr";
import {
	Button,
	Card,
	FadeIn,
	Input,
	PageHeader,
	Row,
	SectionHeader,
	Select,
	Stack,
	Text,
	Textarea,
} from "@/components";
import { api, apiData } from "@/constants/api";
import { fetcher } from "@/constants/fetcher";
import { formatDateTime } from "@/constants/formatters";
import { useAuth } from "@/hooks/Auth/useAuth";
import { useToast } from "@/hooks/useToast";

type Audience = "buyer" | "vendor";

interface HelpTopic {
	id: string;
	title: string;
	summary: string;
	audience: Audience | "all";
	popular?: boolean;
	body: string[];
}

const TOPICS: HelpTopic[] = [
	{
		id: "how-prechop-works",
		title: "How Prechop works",
		summary:
			"Browse kitchens, reserve a meal, then pick up or receive delivery.",
		audience: "buyer",
		popular: true,
		body: [
			"Browse campus kitchens and open daily menus.",
			"Choose your meal, options, pickup or delivery.",
			"Pay through Paystack to reserve your order before the vendor cooks.",
			"Track the order until it is ready for pickup or delivery.",
		],
	},
	{
		id: "service-fee",
		title: "What is the service fee?",
		summary: "A small buyer fee may be added at checkout to run Prechop.",
		audience: "buyer",
		popular: true,
		body: [
			"The service fee is shown before payment, so buyers can review the final total.",
			"It helps cover platform operations, order tracking and support.",
			"Paystack processing is included in the checkout calculation.",
		],
	},
	{
		id: "pay-for-me",
		title: "How Pay for Me works",
		summary:
			"Create a secure payment link for someone else to pay your order.",
		audience: "buyer",
		popular: true,
		body: [
			"Choose Pay for Me at checkout to create a secure payment link.",
			"Send the link to a parent, friend or sponsor.",
			"Once they pay through Paystack, your original order is confirmed automatically.",
		],
	},
	{
		id: "refunds-cancellations",
		title: "Refund and cancellation policy",
		summary:
			"Cancelled paid orders are handled through the original payment route.",
		audience: "all",
		popular: true,
		body: [
			"If a paid order is cancelled, Prechop starts the refund process through the original payment route.",
			"Refund timing can depend on Paystack and the buyer's bank.",
			"Vendors should cancel only when they cannot fulfil the order.",
		],
	},
	{
		id: "pickup-delivery",
		title: "Pickup and delivery",
		summary:
			"Vendors choose pickup, delivery, or both for each daily order.",
		audience: "buyer",
		body: [
			"Pickup orders show the vendor's pickup location.",
			"Delivery orders ask for the buyer's delivery details at checkout.",
			"Closed vendors remain visible so buyers can still inspect menus and opening times.",
		],
	},
	{
		id: "daily-menu",
		title: "How to create a daily menu",
		summary:
			"Build your menu, set options, then publish a daily order window.",
		audience: "vendor",
		popular: true,
		body: [
			"Add menu items with prices, photos, categories and option groups.",
			"Create a daily order from the dashboard or timetable.",
			"Choose opening and cutoff times, quantities, pickup, delivery or both.",
		],
	},
	{
		id: "incoming-orders",
		title: "Incoming orders",
		summary: "Paid orders appear after Paystack confirms payment.",
		audience: "vendor",
		popular: true,
		body: [
			"Dashboard shows paid orders that still need your attention.",
			"Pay for Me and self-paid orders enter the same incoming queue after payment confirmation.",
			"Completed, cancelled and refunded orders move out of Incoming orders into history.",
		],
	},
	{
		id: "cooking-status",
		title: "Cooking statuses",
		summary: "Move orders from paid to completed as you cook and fulfil.",
		audience: "vendor",
		body: [
			"Confirm paid orders when you accept them.",
			"Move orders to Preparing when cooking starts, Ready when food is available, and Completed after pickup or delivery.",
			"Buyers can follow these updates from their order page.",
		],
	},
	{
		id: "vendor-settlements",
		title: "Vendor commission and settlements",
		summary:
			"Settlements are calculated from sales after fees and commission.",
		audience: "vendor",
		popular: true,
		body: [
			"Prechop commission and Paystack processing are calculated from the order payment.",
			"Your expected settlement is based on food sales plus delivery fees owed to you, minus applicable costs.",
			"Earnings shows completed paid orders and settlement-related figures.",
		],
	},
	{
		id: "account-settings",
		title: "Account settings",
		summary:
			"Manage profile, campus, location, bank details and notifications.",
		audience: "all",
		body: [
			"Buyers can update profile, campus and notifications from Account.",
			"Vendors can update business profile, location, delivery defaults, bank details and notification preferences from Settings.",
		],
	},
	{
		id: "contact-support",
		title: "How to contact support",
		summary:
			"Send support a clear message with your order or kitchen details.",
		audience: "all",
		popular: true,
		body: [
			"Use Contact support for payment, refund, order or account issues.",
			"Include your order number, kitchen name and a short description so support can help faster.",
		],
	},
];

const Hero = styled(Card)`
	padding: clamp(22px, 5vw, 42px);
	background: linear-gradient(145deg, #281309 0%, #5a210d 56%, #9a3b0b 100%);
	color: var(--pc-text-inverse);
	border: 1px solid color-mix(in srgb, var(--pc-color-primary) 32%, transparent);
	box-shadow: var(--pc-shadow-calm-orange);
`;
const HeroTitle = styled.h1`
	font-family: var(--pc-font-display);
	font-size: clamp(34px, 7vw, 58px);
	line-height: 1.03;
	letter-spacing: -0.04em;
	margin: 0;
`;
const HeroSub = styled.p`
	max-width: 620px;
	color: rgba(255, 247, 237, 0.78);
	font-size: 16px;
	line-height: 1.55;
	margin: 0;
`;
const SearchWrap = styled.div`
	max-width: 720px;
	margin-top: var(--pc-space-4);
`;
const AudienceTabs = styled.div`
	display: inline-flex;
	gap: 4px;
	padding: 4px;
	background: var(--pc-surface-2);
	border: 1px solid var(--pc-border);
	border-radius: var(--pc-radius-pill);
`;
const Tab = styled.button<{ $active: boolean }>`
	border: none;
	cursor: pointer;
	border-radius: var(--pc-radius-pill);
	padding: 8px 14px;
	font-weight: 800;
	color: ${(p) => (p.$active ? "var(--pc-color-primary)" : "var(--pc-text-muted)")};
	background: ${(p) => (p.$active ? "var(--pc-surface)" : "transparent")};
	box-shadow: ${(p) => (p.$active ? "var(--pc-shadow-sm)" : "none")};
`;
const TopicGrid = styled.div`
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 12px;
	@media (max-width: 760px) {
		grid-template-columns: 1fr;
	}
`;
const TopicCard = styled(Card)`
	padding: var(--pc-space-4);
`;
const TopicLink = styled.a`
	color: var(--pc-color-primary);
	font-weight: 800;
	font-size: 13px;
`;
const PillRow = styled.div`
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
`;
const Pill = styled.a`
	display: inline-flex;
	align-items: center;
	min-height: 36px;
	padding: 0 13px;
	border-radius: var(--pc-radius-pill);
	background: var(--pc-surface);
	border: 1px solid var(--pc-border);
	color: var(--pc-text);
	font-weight: 800;
	font-size: 13px;
`;
const SupportCard = styled(Card)`
	padding: var(--pc-space-5);
	background: var(--pc-surface-2);
`;
const MessageCard = styled(Card)<{ $admin?: boolean }>`
	padding: var(--pc-space-4);
	background: ${(p) =>
		p.$admin ? "var(--pc-color-primary-50)" : "var(--pc-surface)"};
`;

interface SupportRequest {
	id: string;
	category: string;
	subject: string;
	status: string;
	relatedOrderRef?: string;
	relatedPaymentRef?: string;
	messages: Array<{
		id: string;
		senderRole: "BUYER" | "VENDOR" | "ADMIN";
		body: string;
		createdAt: string;
	}>;
	updatedAt: string;
}

function topicMatches(topic: HelpTopic, audience: Audience, query: string) {
	const audienceMatch =
		topic.audience === "all" || topic.audience === audience;
	if (!audienceMatch) return false;
	if (!query) return true;
	const haystack = [topic.title, topic.summary, ...topic.body]
		.join(" ")
		.toLowerCase();
	return haystack.includes(query.toLowerCase());
}

export default function HelpWrapper({
	initialAudience = "buyer",
}: {
	initialAudience?: Audience;
}) {
	const { isAuthenticated, can } = useAuth();
	const { toast } = useToast();
	const [audience, setAudience] = useState<Audience>(initialAudience);
	const [query, setQuery] = useState("");
	const [category, setCategory] = useState("ORDER");
	const [subject, setSubject] = useState("");
	const [message, setMessage] = useState("");
	const [relatedOrderRef, setRelatedOrderRef] = useState("");
	const [relatedPaymentRef, setRelatedPaymentRef] = useState("");
	const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
		null,
	);
	const [reply, setReply] = useState("");
	const [busy, setBusy] = useState(false);
	const canSwitchAudience = can("support:read");
	const { data: supportRequests, mutate: mutateSupport } = useSWR<
		SupportRequest[]
	>(isAuthenticated ? "/support-requests" : null, fetcher, {
		refreshInterval: 10_000,
	});
	const filtered = useMemo(
		() =>
			TOPICS.filter((topic) =>
				topicMatches(topic, audience, query.trim()),
			),
		[audience, query],
	);
	const popular = TOPICS.filter(
		(topic) =>
			topic.popular &&
			(topic.audience === "all" || topic.audience === audience),
	);
	const activeTopics = TOPICS.filter(
		(topic) => topic.audience === audience || topic.audience === "all",
	);
	const selectedRequest =
		supportRequests?.find((request) => request.id === selectedRequestId) ??
		supportRequests?.[0];

	async function submitSupportRequest() {
		if (!isAuthenticated) {
			toast("Log in to send support a message.", "error");
			return;
		}
		if (!subject.trim() || !message.trim()) {
			toast("Add a subject and message.", "error");
			return;
		}
		setBusy(true);
		try {
			const created = await apiData<SupportRequest>(
				api.post("/support-requests", {
					category,
					subject: subject.trim(),
					message: message.trim(),
					...(relatedOrderRef.trim()
						? { relatedOrderRef: relatedOrderRef.trim() }
						: {}),
					...(relatedPaymentRef.trim()
						? { relatedPaymentRef: relatedPaymentRef.trim() }
						: {}),
				}),
			);
			setSubject("");
			setMessage("");
			setRelatedOrderRef("");
			setRelatedPaymentRef("");
			setSelectedRequestId(created.id);
			toast("Support request sent.", "success");
			await mutateSupport();
		} catch {
			toast("Could not send support request.", "error");
		} finally {
			setBusy(false);
		}
	}

	async function sendUserReply() {
		if (!selectedRequest || !reply.trim()) return;
		setBusy(true);
		try {
			await api.post(`/support-requests/${selectedRequest.id}/messages`, {
				message: reply.trim(),
			});
			setReply("");
			toast("Reply sent.", "success");
			await mutateSupport();
		} catch {
			toast("Could not send reply.", "error");
		} finally {
			setBusy(false);
		}
	}

	return (
		<FadeIn>
			<Stack $gap={18}>
				<Hero>
					<Stack $gap={14}>
						<Text
							style={{ color: "rgba(255,247,237,0.72)" }}
							$weight={800}
						>
							Help & Information
						</Text>
						<HeroTitle>Hi there. How can we help?</HeroTitle>
						<HeroSub>
							Find quick answers about ordering, Pay for Me,
							refunds, menus, incoming orders and vendor
							settlements.
						</HeroSub>
						<SearchWrap>
							<Input
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								placeholder="Search for help"
								aria-label="Search help topics"
							/>
						</SearchWrap>
						<Row $gap={10} $wrap>
							<Button
								as="a"
								href="#support-form"
								$variant="secondary"
							>
								Send us a message
							</Button>
							<Button
								as="a"
								href="#support-form"
								$variant="ghost"
							>
								Report a problem
							</Button>
						</Row>
					</Stack>
				</Hero>

				<Row $justify="space-between" $align="center" $gap={12} $wrap>
					<PageHeader
						eyebrow="Browse help"
						title="Popular topics"
						subtitle="Short answers for the questions people ask first."
					/>
					{canSwitchAudience && (
						<AudienceTabs aria-label="Help audience">
							<Tab
								type="button"
								$active={audience === "buyer"}
								onClick={() => setAudience("buyer")}
							>
								Buyer
							</Tab>
							<Tab
								type="button"
								$active={audience === "vendor"}
								onClick={() => setAudience("vendor")}
							>
								Vendor
							</Tab>
						</AudienceTabs>
					)}
				</Row>

				{query.trim() ? (
					<Card>
						<Stack $gap={12}>
							<SectionHeader
								title={`Search results (${filtered.length})`}
								icon="?"
							/>
							<TopicGrid>
								{filtered.map((topic) => (
									<Topic key={topic.id} topic={topic} />
								))}
							</TopicGrid>
							{filtered.length === 0 && (
								<Text $muted $size={14}>
									No matching topic yet. Try a shorter search
									or contact support.
								</Text>
							)}
						</Stack>
					</Card>
				) : (
					<Card>
						<Stack $gap={12}>
							<SectionHeader
								title="Popular help topics"
								icon="?"
							/>
							<PillRow>
								{popular.map((topic) => (
									<Pill key={topic.id} href={`#${topic.id}`}>
										{topic.title}
									</Pill>
								))}
							</PillRow>
						</Stack>
					</Card>
				)}

				<Card>
					<Stack $gap={12}>
						<SectionHeader
							title={
								audience === "vendor"
									? "Vendor guide"
									: "Buyer help"
							}
							icon={audience === "vendor" ? "🧑‍🍳" : "🛒"}
						/>
						<TopicGrid>
							{activeTopics.map((topic) => (
								<Topic key={topic.id} topic={topic} />
							))}
						</TopicGrid>
					</Stack>
				</Card>

				<Card id="support-form">
					<Stack $gap={12}>
						<SectionHeader title="Send us a message" icon="?" />
						{isAuthenticated ? (
							<>
								<Row $gap={12} $wrap>
									<div style={{ flex: "1 1 180px" }}>
										<Text $muted $size={13}>
											Category
										</Text>
										<Select
											value={category}
											onChange={(e) =>
												setCategory(e.target.value)
											}
										>
											<option value="ORDER">Order</option>
											<option value="PAYMENT">
												Payment
											</option>
											<option value="REFUND">
												Refund
											</option>
											<option value="VENDOR_ACCOUNT">
												Vendor account
											</option>
											<option value="MENU">Menu</option>
											<option value="SETTLEMENT">
												Settlement
											</option>
											<option value="TECHNICAL">
												Technical
											</option>
											<option value="OTHER">Other</option>
										</Select>
									</div>
									<div style={{ flex: "2 1 280px" }}>
										<Text $muted $size={13}>
											Subject
										</Text>
										<Input
											value={subject}
											onChange={(e) =>
												setSubject(e.target.value)
											}
											placeholder="What do you need help with?"
										/>
									</div>
								</Row>
								<Row $gap={12} $wrap>
									<Input
										value={relatedOrderRef}
										onChange={(e) =>
											setRelatedOrderRef(e.target.value)
										}
										placeholder="Order number, optional"
									/>
									<Input
										value={relatedPaymentRef}
										onChange={(e) =>
											setRelatedPaymentRef(e.target.value)
										}
										placeholder="Payment reference, optional"
									/>
								</Row>
								<Textarea
									value={message}
									onChange={(e) => setMessage(e.target.value)}
									placeholder="Tell support what happened."
									rows={4}
								/>
								<Button
									onClick={submitSupportRequest}
									$loading={busy}
									disabled={busy}
									style={{ alignSelf: "flex-start" }}
								>
									Send message
								</Button>
							</>
						) : (
							<Row $gap={10} $wrap>
								<Text $muted>
									Log in to send support a message and keep
									the conversation visible here.
								</Text>
								<Button as="a" href="/login">
									Log in
								</Button>
							</Row>
						)}
					</Stack>
				</Card>

				{isAuthenticated && (
					<Card>
						<Stack $gap={12}>
							<SectionHeader
								title="Your support conversations"
								icon="?"
							/>
							{(supportRequests ?? []).length > 0 ? (
								<Row $gap={12} $align="flex-start" $wrap>
									<Stack
										$gap={8}
										style={{ flex: "1 1 240px" }}
									>
										{(supportRequests ?? []).map(
											(request) => (
												<Button
													key={request.id}
													$variant={
														selectedRequest?.id ===
														request.id
															? "secondary"
															: "ghost"
													}
													onClick={() =>
														setSelectedRequestId(
															request.id,
														)
													}
													style={{
														justifyContent:
															"flex-start",
													}}
												>
													<Stack $gap={2}>
														<Text $weight={800}>
															{request.subject}
														</Text>
														<Text $muted $size={12}>
															{request.status} ·{" "}
															{formatDateTime(
																request.updatedAt,
															)}
														</Text>
													</Stack>
												</Button>
											),
										)}
									</Stack>
									<Stack
										$gap={10}
										style={{ flex: "2 1 360px" }}
									>
										{selectedRequest?.messages.map(
											(item) => (
												<MessageCard
													key={item.id}
													$admin={
														item.senderRole ===
														"ADMIN"
													}
												>
													<Stack $gap={4}>
														<Text
															$weight={800}
															$size={13}
														>
															{item.senderRole} ·{" "}
															{formatDateTime(
																item.createdAt,
															)}
														</Text>
														<Text $size={14}>
															{item.body}
														</Text>
													</Stack>
												</MessageCard>
											),
										)}
										<Textarea
											value={reply}
											onChange={(e) =>
												setReply(e.target.value)
											}
											placeholder="Reply to support..."
											rows={3}
										/>
										<Button
											onClick={sendUserReply}
											$loading={busy}
											disabled={busy || !reply.trim()}
											style={{ alignSelf: "flex-start" }}
										>
											Send reply
										</Button>
									</Stack>
								</Row>
							) : (
								<Text $muted $size={14}>
									No support conversations yet.
								</Text>
							)}
						</Stack>
					</Card>
				)}

				<SupportCard>
					<Row
						$justify="space-between"
						$align="center"
						$gap={12}
						$wrap
					>
						<Stack $gap={4}>
							<Text $weight={800} $size={18}>
								Still need help?
							</Text>
							<Text $muted $size={14}>
								Send your order number, kitchen name or account
								phone number so support can trace the issue.
							</Text>
						</Stack>
						<Button as="a" href="mailto:support@prechop.ng">
							Contact support
						</Button>
					</Row>
				</SupportCard>
			</Stack>
		</FadeIn>
	);
}

function Topic({ topic }: { topic: HelpTopic }) {
	return (
		<TopicCard id={topic.id}>
			<Stack $gap={8}>
				<Text $weight={800}>{topic.title}</Text>
				<Text $muted $size={13}>
					{topic.summary}
				</Text>
				<Stack as="ul" $gap={5} style={{ paddingLeft: 18, margin: 0 }}>
					{topic.body.map((line) => (
						<li key={line}>
							<Text $muted $size={13}>
								{line}
							</Text>
						</li>
					))}
				</Stack>
				<TopicLink href="mailto:support@prechop.ng">
					Ask about this
				</TopicLink>
			</Stack>
		</TopicCard>
	);
}
