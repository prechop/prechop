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

type HelpSection = "buyer" | "vendor" | "account" | "support";
type HelpAudience = "guest" | "buyer" | "vendor";

interface HelpTopic {
	id: string;
	title: string;
	summary: string;
	section: HelpSection;
	audiences?: HelpAudience[];
	popular?: boolean;
	body: string[];
	keywords?: string[];
	links?: Array<{ label: string; href: string }>;
}

const TOPICS: HelpTopic[] = [
	{
		id: "place-an-order",
		title: "How do I place an order?",
		summary: "Choose a kitchen, customise your meal and pay securely.",
		section: "buyer",
		popular: true,
		body: [
			"Open Marketplace, confirm your campus and choose an open kitchen or daily listing.",
			"Select the items, quantities, variants and extras you want, then choose pickup or delivery and add any required delivery details.",
			"Review the food subtotal, delivery fee, service fee and total before continuing to Paystack. Your order moves forward only after Prechop verifies a successful payment.",
			"Each order is for one kitchen. Place separate orders when buying from different vendors.",
		],
		keywords: ["checkout", "buy food", "quantity", "options", "extras"],
	},
	{
		id: "order-total",
		title: "What makes up my order total?",
		summary: "See food, delivery and service costs before paying.",
		section: "buyer",
		popular: true,
		body: [
			"Your total can include the food and selected extras, a vendor-set delivery fee for delivery orders, and the current buyer service or payment-processing fee.",
			"Every applicable amount is shown before payment. Fees are configurable, so the checkout total is the source of truth for that order.",
		],
		keywords: ["price", "charges", "processing fee", "delivery fee"],
		links: [
			{
				label: "Payments policy",
				href: "/policies/payments-and-settlement",
			},
		],
	},
	{
		id: "pay-for-me",
		title: "How does Pay for Me work?",
		summary:
			"Create a secure payment link for someone else to pay your order.",
		section: "buyer",
		popular: true,
		body: [
			"Choose Pay for Me at checkout to create a secure payment link.",
			"Send the link to a parent, friend or sponsor. They can review the order summary and pay through Paystack without gaining access to your account.",
			"The link works only while the reservation and listing remain active. If it expires or is cancelled, the held quantity is released.",
			"After successful payment verification, the original order updates automatically.",
		],
		keywords: [
			"external payer",
			"sponsor",
			"parent",
			"payment link",
			"expired link",
		],
	},
	{
		id: "track-order-status",
		title: "How do I track my order and understand its status?",
		summary:
			"Follow payment, acceptance, preparation and fulfilment separately.",
		section: "buyer",
		popular: true,
		body: [
			"Open My Orders and select the order to see its timeline and current state.",
			"Pending payment or awaiting external payment describes payment. Paid or awaiting vendor acceptance means payment succeeded but the vendor still needs to respond. Accepted, preparing, ready and in transit describe fulfilment.",
			"Cancelled, refund pending, refund processing, refunded and refund failed describe the financial recovery path. These are not vendor-payout statuses.",
		],
		keywords: [
			"pending",
			"paid",
			"accepted",
			"preparing",
			"ready",
			"in transit",
			"completed",
		],
	},
	{
		id: "pickup-delivery",
		title: "How do pickup, delivery and handover work?",
		summary: "Collect from the kitchen or receive vendor-managed delivery.",
		section: "buyer",
		body: [
			"For pickup, wait until the order is marked ready and go to the displayed kitchen location. For delivery, provide accurate contact and address details and remain reachable.",
			"Delivery is managed by the vendor unless Prechop announces a separate delivery service. The vendor controls coverage, fee, estimate and rider arrangements.",
			"Show the order QR code or PIN only when you receive the food. QR, PIN or an authorized support confirmation records trusted handover, but support can still review a reported problem.",
		],
		keywords: [
			"QR",
			"PIN",
			"rider",
			"address",
			"handover",
			"contact kitchen",
		],
		links: [
			{
				label: "Pickup and delivery policy",
				href: "/policies/pickup-and-delivery",
			},
		],
	},
	{
		id: "cancel-order",
		title: "Can I cancel or change an order?",
		summary: "Cancellation depends on how far the order has progressed.",
		section: "buyer",
		body: [
			"You can cancel only while the order is in an allowed early state. Pay for Me requests can be cancelled while they are still awaiting payment.",
			"The normal flow does not edit a paid order. If preparation has advanced, contact the kitchen or support; cancellation and any refund require review under the applicable policy.",
		],
		keywords: ["edit order", "change item", "change address"],
		links: [
			{
				label: "Cancellation and refunds policy",
				href: "/policies/cancellation-and-refunds",
			},
		],
	},
	{
		id: "refund-statuses",
		title: "What do the different refund statuses mean?",
		summary: "Understand pending, processing, refunded and failed refunds.",
		section: "buyer",
		popular: true,
		body: [
			"Refund pending means Prechop has identified that money should be returned but provider processing has not completed. Refund processing means the request is being handled with the payment provider.",
			"Refunded means the provider accepted the completed refund outcome. Refund failed means the attempt needs investigation or recovery; contact support with the order number and payment reference.",
			"Refund timing is not guaranteed and can vary with Paystack, the buyer's bank, the refund state and any required review.",
		],
		keywords: [
			"refund pending",
			"refund processing",
			"refund failed",
			"money back",
		],
		links: [
			{
				label: "Cancellation and refunds policy",
				href: "/policies/cancellation-and-refunds",
			},
		],
	},
	{
		id: "late-missing-no-show",
		title: "What if my order is late, missing or marked as a no-show?",
		summary:
			"Check updates, contact the kitchen and report the problem promptly.",
		section: "buyer",
		body: [
			"Check the order page for a revised estimate, use the order conversation and contact support if the vendor does not respond or the delay becomes serious.",
			"A vendor can report pickup no-show only after the allowed waiting period. For delivery, the vendor should record arrival and contact attempts before reporting that the buyer is unreachable.",
			"If a report is incorrect, respond through the available order action and provide timing, messages, call history or other useful evidence.",
		],
		keywords: [
			"buyer unreachable",
			"failed delivery",
			"pickup problem",
			"delay",
		],
		links: [
			{ label: "Buyer no-show policy", href: "/policies/buyer-no-show" },
			{ label: "Dispute policy", href: "/policies/disputes" },
		],
	},
	{
		id: "receipts-reviews-reorder",
		title: "How do receipts, reviews and reorders work?",
		summary:
			"Use completed orders for receipts, feedback and repeat purchases.",
		section: "buyer",
		body: [
			"A completed order can provide a downloadable receipt when generation succeeds, and Prechop may also email the PDF receipt.",
			"Only the buyer of a completed order can leave one review within the configured review window.",
			"Reorder compares the old order with the vendor's current listing. Prices, items, options, quantities and fees may have changed, so review the new checkout before paying.",
		],
		keywords: [
			"receipt pending",
			"receipt failed",
			"rate vendor",
			"review window",
			"order again",
		],
	},
	{
		id: "become-vendor",
		title: "How do I become an approved vendor?",
		summary: "Complete identity, location, bank and verification steps.",
		section: "vendor",
		popular: true,
		body: [
			"Start a vendor application from your account and complete your business identity, food categories, location, bank details, profile image and required verification documents.",
			"Submit the completed application for admin review. Pending review means it is being assessed; changes requested means you should correct the stated issues and resubmit.",
			"Approval activates the vendor profile, but your storefront must also meet the current menu, timetable, bank and completeness requirements before it can take orders.",
		],
		keywords: [
			"onboarding",
			"documents",
			"approval",
			"changes requested",
			"verification",
		],
		links: [{ label: "Vendor terms", href: "/terms" }],
	},
	{
		id: "vendor-profile-public",
		title: "How do I complete and manage my storefront?",
		summary:
			"Keep public business details, location and opening status accurate.",
		section: "vendor",
		body: [
			"Vendor Settings manages your business name, description, profile image, contact details, location, service campuses, store link, delivery defaults and notification preferences.",
			"Buyers may see your business identity, profile image, service area, categories, opening status, fulfilment options and eligible rating information. Bank details, security PINs and verification documents are not public.",
			"Closing your kitchen stops new orders but does not cancel your responsibility for existing paid or accepted orders.",
		],
		keywords: [
			"store slug",
			"profile completeness",
			"open status",
			"closed kitchen",
		],
	},
	{
		id: "create-menu-listing",
		title: "How do I create menus, options and daily listings?",
		summary:
			"Build reusable menu items, then publish a dated order window.",
		section: "vendor",
		popular: true,
		body: [
			"Create clear menu items with an accurate name, description, category, price, preparation time and photo. Add variants for sizes and option groups for extras or required choices.",
			"Create a daily listing from the dashboard or timetable, select items and quantities, and set opening and cutoff times plus pickup or delivery availability.",
			"Editing or soft-deleting a menu item does not rewrite the item and price snapshots stored on existing orders.",
		],
		keywords: [
			"daily menu",
			"timetable",
			"cutoff",
			"sold out",
			"availability",
			"variants",
			"extras",
		],
	},
	{
		id: "listing-times-capacity",
		title: "How do listing times, quantities and sold-out controls work?",
		summary: "Control when buyers order and how much you can fulfil.",
		section: "vendor",
		body: [
			"Opening time controls when ordering can begin; cutoff time stops new checkout. Closing or cancelling a listing also stops new orders.",
			"Item quantity and preparation capacity prevent overselling. Checkout can temporarily hold stock while payment is in progress, then release it if the reservation expires.",
			"Use unavailable when you intentionally pause an item and sold out when its available quantity has finished. Existing paid orders remain your responsibility.",
		],
		keywords: [
			"opening time",
			"cutoff time",
			"capacity",
			"quantity",
			"reservation",
			"close listing",
		],
	},
	{
		id: "incoming-order-flow",
		title: "How should I handle an incoming order?",
		summary:
			"Accept only verified paid orders and update them as work happens.",
		section: "vendor",
		popular: true,
		body: [
			"A self-paid or Pay for Me order enters the incoming queue only after successful payment verification. Do not cook an order that is not shown as paid or awaiting your acceptance.",
			"Accept promptly if you can fulfil the complete order. Then update it through preparing, ready, in transit where applicable, and handover completion as those events happen.",
			"If you cannot fulfil it, reject it promptly with the correct reason. Non-response can expire the order and start cancellation or refund handling.",
		],
		keywords: [
			"accept order",
			"reject order",
			"cooking status",
			"vendor no response",
		],
	},
	{
		id: "vendor-delivery-exceptions",
		title: "What are my delivery, no-show and failed-delivery responsibilities?",
		summary:
			"Use buyer contact and exception actions only for active orders.",
		section: "vendor",
		body: [
			"Vendor-managed delivery means you are responsible for coverage, fee, estimate, rider arrangements and appropriate use of the buyer's delivery information.",
			"For an active accepted delivery order, use the contact action and record genuine attempts before reporting the buyer as unreachable. Add the required arrival time, contact-attempt count and note.",
			"Use delivery failed only after the unreachable process allows it. No-show, failed delivery, open disputes and refunds can require review and affect the financial treatment of that order.",
		],
		keywords: [
			"contact buyer",
			"rider",
			"delivery evidence",
			"pickup no-show",
		],
		links: [
			{
				label: "Pickup and delivery policy",
				href: "/policies/pickup-and-delivery",
			},
			{ label: "Buyer no-show policy", href: "/policies/buyer-no-show" },
		],
	},
	{
		id: "vendor-earnings-payout",
		title: "When will I receive my money?",
		summary:
			"Payment, fulfilment and payout records describe different events.",
		section: "vendor",
		popular: true,
		body: [
			"A successful buyer payment creates a pending vendor payable; it does not mean you have been paid. Payment status, Order status and Vendor Payout status are separate.",
			"Trusted fulfilment through the buyer's QR or PIN, or an authorized support-confirmed handover, starts the 24-hour review period. An open dispute, refund, failed-delivery or no-show review, or payout hold keeps the affected amount from becoming eligible.",
			"After the review period and checks clear, the amount becomes eligible for the next automated payout run. It may move through eligible, queued and processing before Paystack Transfer pays your verified bank destination. A payout can also be held, failed or reversed; banking and Paystack processing can affect arrival time.",
		],
		keywords: [
			"settlement",
			"payout",
			"bank",
			"commission",
			"earnings",
			"Paystack",
			"transfer",
		],
		links: [
			{
				label: "Payments and settlement policy",
				href: "/policies/payments-and-settlement",
			},
		],
	},
	{
		id: "vendor-bank-details",
		title: "How do I add or change my payout bank details?",
		summary:
			"Resolve the account carefully and protect changes with your PIN.",
		section: "vendor",
		body: [
			"Choose your bank, enter the account number and confirm the resolved account name before saving. Prechop uses Paystack to validate your verified transfer destination for future V2 payouts.",
			"A vendor security PIN can be required for sensitive bank changes. If you reset the PIN, a temporary security hold may apply to sensitive actions.",
			"Contact support immediately if the saved destination is wrong or you suspect unauthorized changes.",
		],
		keywords: [
			"account number",
			"account name",
			"bank change",
			"recipient",
			"transfer recipient",
		],
	},
	{
		id: "vendor-reviews-analytics",
		title: "How do reviews, followers and vendor analytics work?",
		summary:
			"Use completed-order feedback and operational performance insights.",
		section: "vendor",
		body: [
			"Verified buyers can review completed orders within the configured review window. Report a review only for a genuine policy issue, not simply because it is critical.",
			"Public ratings appear only after the required review threshold. Followers and notification preferences control applicable store updates.",
			"Analytics can include orders, completion, cancellations, revenue, average order value, popular items, peak hours and ratings. Unpaid, cancelled and refunded attempts are not presented as settled revenue.",
		],
		keywords: [
			"rating",
			"negative review",
			"followers",
			"completion rate",
			"top items",
		],
	},
	{
		id: "vendor-suspension-closure",
		title: "What happens if my vendor profile is suspended or closed?",
		summary:
			"New selling can stop while valid records and obligations remain.",
		section: "vendor",
		body: [
			"Suspension can stop selling while Prechop reviews fraud, safety, inaccurate information, policy breaches or repeated fulfilment problems.",
			"You cannot close a vendor profile with unresolved orders, payments, refunds or disputes. Closure removes the public vendor profile and closes active listings but preserves historical financial and order records.",
			"Closing the vendor side can preserve the buyer account. Contact support if you need to challenge a suspension or discuss a closed profile.",
		],
		keywords: [
			"suspended",
			"close store",
			"delete vendor",
			"outstanding obligations",
			"payout hold",
		],
		links: [{ label: "Vendor terms", href: "/terms" }],
	},
	{
		id: "sign-in-account-settings",
		title: "How do I sign in and manage my account?",
		summary:
			"Use secure sign-in and keep profile and campus details current.",
		section: "account",
		audiences: ["guest", "buyer", "vendor"],
		popular: true,
		body: [
			"Use an available secure email link, Google sign-in or other enabled verification option. Prechop does not require a reusable account password in the current flow.",
			"Use the settings available to your account to keep your profile, contact and notification details current.",
			"If you suspect unauthorized access, secure your email or Google account, sign out and contact support.",
		],
		keywords: [
			"login",
			"magic link",
			"Google",
			"campus",
			"profile",
			"security",
		],
	},
	{
		id: "payment-order-payout-status",
		title: "What is the difference between payment, order and vendor payout status?",
		summary:
			"They are separate lifecycles and should not be read as one state.",
		section: "account",
		audiences: ["vendor"],
		popular: true,
		body: [
			"Payment status answers whether the buyer charge succeeded, failed, expired, was cancelled or was refunded.",
			"Order status answers whether the vendor accepted, prepared, made ready, delivered or completed the order, or whether an exception occurred.",
			"Vendor Payout status answers whether a pending payable is in its review period, held, eligible, queued, processing, paid to the verified bank, failed or reversed. Payment success does not prove fulfilment, and order completion alone does not mean a bank transfer has completed.",
		],
		keywords: [
			"paid",
			"completed",
			"settled",
			"eligible",
			"queued",
			"processing",
			"held",
			"reversed",
		],
	},
	{
		id: "notifications",
		title: "Which notifications can I receive or control?",
		summary:
			"Important events can use in-app, email, SMS or push channels.",
		section: "account",
		audiences: ["buyer", "vendor"],
		body: [
			"Prechop can send account, security, order, payment, refund, review and support updates through available in-app, email, SMS, WhatsApp or browser-push channels.",
			"You can control supported optional notification categories from the settings available to your account. Critical security, transaction or support notices may still be sent when necessary.",
			"Browser push also depends on permission in your browser or device settings.",
		],
		keywords: ["email", "SMS", "WhatsApp", "push", "unsubscribe"],
	},
	{
		id: "privacy-data-sharing",
		title: "What information does Prechop use and who can see it?",
		summary:
			"Only relevant data should be used for accounts, orders and support.",
		section: "account",
		audiences: ["guest", "buyer", "vendor"],
		body: [
			"Prechop uses account, campus, order, delivery, payment-reference, vendor, message, review, support, device and security information to operate and protect the marketplace.",
			"The relevant vendor can access the delivery details needed for an eligible active order. Authorized support staff may inspect related records to resolve a problem. Providers such as Paystack, email, messaging, storage and push services receive the data needed to perform their service.",
			"A vendor must not reuse buyer contact information for unrelated marketing.",
		],
		keywords: [
			"personal data",
			"phone",
			"address",
			"third party",
			"vendor access",
		],
		links: [{ label: "Privacy notice", href: "/privacy" }],
	},
	{
		id: "close-account",
		title: "How do I close my account, and what is retained?",
		summary: "Resolve active obligations before deactivation.",
		section: "account",
		audiences: ["buyer", "vendor"],
		body: [
			"Use the account-closure action, confirm your account identifier and complete recent authentication when requested.",
			"Active orders, payments, refunds or disputes must be resolved first. The current process deactivates the account and revokes sessions rather than erasing every historical record immediately.",
			"Transaction, fulfilment, refund, dispute, security and audit records may be retained for operational, accounting, fraud-prevention or legal reasons. Contact support for a privacy request.",
		],
		keywords: ["delete account", "deactivate", "erase data", "retention"],
		links: [{ label: "Privacy notice", href: "/privacy" }],
	},
	{
		id: "contact-support",
		title: "How do I contact support?",
		summary: "Send a clear request and include the relevant reference.",
		section: "support",
		audiences: ["guest", "buyer", "vendor"],
		popular: true,
		body: [
			"Use the support form below for the account, order, payment, payout, technical or other issues relevant to your use of Prechop.",
			"Include a clear subject, what happened, the order number or payment reference when applicable, relevant dates and any useful evidence.",
			"Never send full card details, authentication tokens or your vendor security PIN.",
		],
		keywords: ["help", "message", "ticket", "complaint"],
	},
	{
		id: "support-statuses",
		title: "What do support-request statuses mean?",
		summary: "Know when support needs action from you.",
		section: "support",
		audiences: ["buyer", "vendor"],
		body: [
			"Open means the request is awaiting or receiving review. Pending user means support needs more information from you.",
			"Resolved means a resolution has been provided or completed. Closed means the conversation is complete.",
			"Signed-in users can read their support conversations and reply from this page.",
		],
		keywords: ["open", "pending user", "resolved", "closed", "reply"],
	},
	{
		id: "dispute-evidence",
		title: "How are order disputes reviewed?",
		summary:
			"Support considers the complete order record, not one signal alone.",
		section: "support",
		audiences: ["buyer", "vendor"],
		body: [
			"Report non-delivery, failed delivery, wrong or missing items, quality problems, incorrect no-show reports, vendor unavailability, or payment and refund failures promptly.",
			"Support may review order and menu snapshots, payment records, the timeline, QR or PIN confirmation, messages, photographs and notes from both parties.",
			"Possible outcomes include requesting more evidence, leaving the completion outcome unchanged, rejecting the dispute, or starting an eligible full or partial refund.",
		],
		keywords: [
			"wrong item",
			"missing item",
			"quality",
			"non-delivery",
			"photos",
			"appeal",
		],
		links: [{ label: "Dispute policy", href: "/policies/disputes" }],
	},
];

const SECTION_LABELS: Record<HelpSection, string> = {
	buyer: "Buyer FAQs",
	vendor: "Vendor FAQs",
	account: "Account, Payments & Privacy",
	support: "Contact Support",
};

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
const SectionTabs = styled.div`
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
	padding: 4px;
	background: var(--pc-surface-2);
	border: 1px solid var(--pc-border);
	border-radius: var(--pc-radius-lg);
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
const AccordionList = styled.div`
	display: grid;
	gap: 8px;
`;
const TopicDetails = styled.details`
	background: var(--pc-surface);
	border: 1px solid var(--pc-border);
	border-radius: var(--pc-radius-lg);
	overflow: hidden;

	&[open] {
		border-color: color-mix(in srgb, var(--pc-color-primary) 32%, var(--pc-border));
	}
`;
const TopicSummary = styled.summary`
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 15px 16px;
	cursor: pointer;
	list-style: none;
	font-weight: 800;
	color: var(--pc-text);

	&::-webkit-details-marker {
		display: none;
	}

	&::before {
		content: "⌄";
		flex: 0 0 auto;
		color: var(--pc-color-primary);
		font-size: 18px;
		line-height: 1;
		transition: transform 160ms ease;
	}

	${TopicDetails}[open] &::before {
		transform: rotate(180deg);
	}
`;
const TopicBody = styled.div`
	display: grid;
	gap: 9px;
	padding: 0 16px 16px 44px;
	border-top: 1px solid var(--pc-border);
	padding-top: 13px;

	@media (max-width: 560px) {
		padding-left: 16px;
	}
`;
const TopicLink = styled.a`
	color: var(--pc-color-primary);
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

function topicMatches(topic: HelpTopic, query: string) {
	if (!query) return true;
	const haystack = [
		topic.title,
		topic.summary,
		...topic.body,
		...(topic.keywords ?? []),
	]
		.join(" ")
		.toLowerCase();
	return haystack.includes(query.toLowerCase());
}

function topicIsVisible(topic: HelpTopic, audience: HelpAudience) {
	if (topic.audiences) return topic.audiences.includes(audience);
	if (topic.section === "buyer") return audience === "buyer";
	if (topic.section === "vendor") return audience === "vendor";
	return audience !== "guest";
}

export default function HelpWrapper({
	initialAudience = "buyer",
	initialCategory = "ORDER",
	initialOrderRef = "",
	initialPaymentRef = "",
}: {
	initialAudience?: "buyer" | "vendor";
	initialCategory?: string;
	initialOrderRef?: string;
	initialPaymentRef?: string;
}) {
	const { isAuthenticated, inGroup } = useAuth();
	const { toast } = useToast();
	const audience: HelpAudience = !isAuthenticated
		? "guest"
		: inGroup("Vendors")
			? "vendor"
			: "buyer";
	const allowedSections: HelpSection[] =
		audience === "guest"
			? ["account", "support"]
			: [audience, "account", "support"];
	const [section, setSection] = useState<HelpSection>(initialAudience);
	const visibleSection = allowedSections.includes(section)
		? section
		: allowedSections[0];
	const [query, setQuery] = useState("");
	const [category, setCategory] = useState(initialCategory.toUpperCase());
	const [subject, setSubject] = useState("");
	const [message, setMessage] = useState("");
	const [relatedOrderRef, setRelatedOrderRef] = useState(initialOrderRef);
	const [relatedPaymentRef, setRelatedPaymentRef] =
		useState(initialPaymentRef);
	const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
		null,
	);
	const [reply, setReply] = useState("");
	const [busy, setBusy] = useState(false);
	const { data: supportRequests, mutate: mutateSupport } = useSWR<
		SupportRequest[]
	>(isAuthenticated ? "/support-requests" : null, fetcher, {
		refreshInterval: 10_000,
	});
	const filtered = useMemo(
		() =>
			TOPICS.filter(
				(topic) =>
					topicIsVisible(topic, audience) &&
					topicMatches(topic, query.trim()),
			),
		[query, audience],
	);
	const popular = TOPICS.filter(
		(topic) => topic.popular && topicIsVisible(topic, audience),
	).slice(0, 5);
	const activeTopics = TOPICS.filter(
		(topic) =>
			topic.section === visibleSection && topicIsVisible(topic, audience),
	);

	function selectSection(next: HelpSection) {
		setSection(next);
	}
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
							{audience === "vendor"
								? "Find answers about selling, fulfilment, earnings, V2 payouts and vendor support."
								: audience === "buyer"
									? "Find answers about ordering, payments, pickup, delivery, refunds and buyer support."
									: "Find general information about Prechop, account security, privacy and support."}
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
						title="Help Center"
						subtitle="Search everything or browse a focused section."
					/>
				</Row>

				<SectionTabs aria-label="Help sections">
					{allowedSections.map((key) => (
						<Tab
							key={key}
							type="button"
							$active={visibleSection === key}
							onClick={() => selectSection(key)}
						>
							{SECTION_LABELS[key]}
						</Tab>
					))}
				</SectionTabs>

				{query.trim() ? (
					<Card>
						<Stack $gap={12}>
							<SectionHeader
								title={`Search results (${filtered.length})`}
								icon="?"
							/>
							<AccordionList>
								{filtered.map((topic) => (
									<Topic key={topic.id} topic={topic} />
								))}
							</AccordionList>
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
							<AccordionList>
								{popular.map((topic) => (
									<Topic
										key={`popular-${topic.id}`}
										topic={topic}
									/>
								))}
							</AccordionList>
						</Stack>
					</Card>
				)}

				<Card>
					<Stack $gap={12}>
						<SectionHeader
							title={
								audience === "guest" &&
								visibleSection === "account"
									? "General Help"
									: SECTION_LABELS[visibleSection]
							}
							icon="?"
						/>
						<AccordionList>
							{activeTopics.map((topic) => (
								<Topic key={topic.id} topic={topic} />
							))}
						</AccordionList>
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
						<Button
							as="a"
							href="https://wa.me/2349031260633?text=Hi%20Prechop%20Support%2C%20I%20need%20help%20with%20an%20issue."
						>
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
		<TopicDetails id={topic.id}>
			<TopicSummary>{topic.title}</TopicSummary>
			<TopicBody>
				<Text $muted $size={13}>
					{topic.summary}
				</Text>
				{topic.body.map((line) => (
					<Text key={line} $muted $size={13}>
						{line}
					</Text>
				))}
				{topic.links && topic.links.length > 0 && (
					<Row $gap={12} $wrap>
						{topic.links.map((link) => (
							<TopicLink key={link.href} href={link.href}>
								{link.label}
							</TopicLink>
						))}
					</Row>
				)}
				<TopicLink href="#support-form">Ask about this</TopicLink>
			</TopicBody>
		</TopicDetails>
	);
}
