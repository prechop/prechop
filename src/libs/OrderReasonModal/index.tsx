"use client";

import { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { Button, Stack, Text } from "@/components";

export interface OrderReasonOption {
	code: string;
	label: string;
	requiresExplanation?: boolean;
}

export interface OrderReasonPayload {
	reason: string;
	reasonCode: string;
	explanation: string;
}

interface OrderReasonModalProps {
	open: boolean;
	title: string;
	description: string;
	consequence: string;
	confirmLabel: string;
	options: OrderReasonOption[];
	loading?: boolean;
	error?: string | null;
	onCancel: () => void;
	onConfirm: (payload: OrderReasonPayload) => void;
}

const Overlay = styled.div`
	position: fixed;
	inset: 0;
	z-index: 1600;
	display: grid;
	place-items: center;
	padding: var(--pc-space-4);
	background: rgba(20, 16, 12, 0.66);

	@media (max-width: 640px) {
		align-items: end;
		padding: 0;
	}
`;

const Sheet = styled.div`
	width: min(100%, 480px);
	max-height: min(88dvh, 680px);
	overflow: auto;
	border: 1px solid var(--pc-border);
	border-radius: var(--pc-radius-lg);
	background: var(--pc-surface);
	box-shadow: var(--pc-shadow-lg);
	padding: var(--pc-space-5);

	@media (max-width: 640px) {
		width: 100%;
		border-radius: 22px 22px 0 0;
		padding: var(--pc-space-4);
	}
`;

const OptionGrid = styled.div`
	display: grid;
	gap: 8px;
`;

const OptionButton = styled.button<{ $selected: boolean }>`
	display: flex;
	align-items: center;
	justify-content: space-between;
	width: 100%;
	border: 1px solid
		${({ $selected }) =>
			$selected ? "var(--pc-color-primary)" : "var(--pc-border)"};
	border-radius: var(--pc-radius-sm);
	background: ${({ $selected }) =>
		$selected ? "var(--pc-color-primary-50)" : "var(--pc-surface-muted)"};
	color: var(--pc-text);
	padding: 12px 14px;
	font: inherit;
	font-weight: 800;
	text-align: left;
	cursor: pointer;

	&:hover,
	&:focus-visible {
		border-color: var(--pc-color-primary);
		outline: none;
	}
`;

const Explanation = styled.textarea`
	width: 100%;
	min-height: 92px;
	resize: vertical;
	border: 1px solid var(--pc-border);
	border-radius: var(--pc-radius-sm);
	background: var(--pc-surface-muted);
	color: var(--pc-text);
	padding: 12px 14px;
	font: inherit;
	line-height: 1.35;

	&:focus {
		border-color: var(--pc-color-primary);
		outline: none;
		box-shadow: 0 0 0 3px var(--pc-ring);
	}
`;

const Notice = styled.div`
	padding: 10px 12px;
	border-radius: var(--pc-radius-sm);
	background: var(--pc-color-warning-50);
	color: var(--pc-color-warning-ink);
	font-size: 13px;
	line-height: 1.4;
`;

const ErrorText = styled(Text)`
	color: var(--pc-color-danger);
`;

const Actions = styled.div`
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;

	@media (max-width: 420px) {
		grid-template-columns: 1fr;
	}
`;

export const VENDOR_REJECT_REASON_OPTIONS: OrderReasonOption[] = [
	{ code: "ITEM_UNAVAILABLE", label: "Item unavailable" },
	{ code: "TOO_MANY_CURRENT_ORDERS", label: "Too many current orders" },
	{ code: "CANNOT_MEET_REQUESTED_TIME", label: "Cannot meet the requested time" },
	{ code: "DELIVERY_UNAVAILABLE", label: "Delivery unavailable" },
	{ code: "OTHER", label: "Other", requiresExplanation: true },
];

export const VENDOR_UNABLE_REASON_OPTIONS: OrderReasonOption[] = [
	{ code: "INGREDIENT_UNAVAILABLE", label: "Ingredient unavailable" },
	{ code: "KITCHEN_ISSUE", label: "Kitchen issue" },
	{ code: "UNEXPECTED_EMERGENCY", label: "Unexpected emergency" },
	{ code: "CANNOT_DELIVER", label: "Cannot deliver" },
	{ code: "OTHER", label: "Other", requiresExplanation: true },
];

export function OrderReasonModal({
	open,
	title,
	description,
	consequence,
	confirmLabel,
	options,
	loading = false,
	error,
	onCancel,
	onConfirm,
}: OrderReasonModalProps) {
	const [selectedCode, setSelectedCode] = useState("");
	const [explanation, setExplanation] = useState("");
	const [validation, setValidation] = useState<string | null>(null);
	const selected = useMemo(
		() => options.find((option) => option.code === selectedCode) ?? null,
		[options, selectedCode],
	);

	useEffect(() => {
		if (!open) {
			setSelectedCode("");
			setExplanation("");
			setValidation(null);
		}
	}, [open]);

	if (!open) return null;

	function submit() {
		if (!selected) {
			setValidation("Choose a reason before continuing.");
			return;
		}
		const trimmed = explanation.trim();
		if (selected.requiresExplanation && !trimmed) {
			setValidation("Add a short explanation for Other.");
			return;
		}
		setValidation(null);
		onConfirm({
			reason: selected.label,
			reasonCode: selected.code,
			explanation: trimmed || selected.label,
		});
	}

	return (
		<Overlay role="presentation" onClick={loading ? undefined : onCancel}>
			<Sheet
				role="dialog"
				aria-modal="true"
				aria-labelledby="order-reason-title"
				onClick={(event) => event.stopPropagation()}
			>
				<Stack $gap={16}>
					<Stack $gap={6}>
						<Text id="order-reason-title" $weight={900} $size={22}>
							{title}
						</Text>
						<Text $muted>{description}</Text>
					</Stack>
					<OptionGrid>
						{options.map((option) => (
							<OptionButton
								key={option.code}
								type="button"
								$selected={selectedCode === option.code}
								onClick={() => {
									setSelectedCode(option.code);
									setValidation(null);
								}}
							>
								<span>{option.label}</span>
								<span>{selectedCode === option.code ? "Selected" : ""}</span>
							</OptionButton>
						))}
					</OptionGrid>
					<Stack $gap={6}>
						<Text $weight={800} $size={13}>
							Short explanation {selected?.requiresExplanation ? "" : "(optional)"}
						</Text>
						<Explanation
							value={explanation}
							maxLength={180}
							placeholder="Add a short note for this order"
							onChange={(event) => {
								setExplanation(event.target.value);
								setValidation(null);
							}}
						/>
					</Stack>
					<Notice>{consequence}</Notice>
					{(validation || error) && (
						<ErrorText $size={13} $weight={800}>
							{validation || error}
						</ErrorText>
					)}
					<Actions>
						<Button
							type="button"
							$variant="secondary"
							disabled={loading}
							onClick={onCancel}
						>
							Cancel
						</Button>
						<Button
							type="button"
							$loading={loading}
							onClick={submit}
						>
							{confirmLabel}
						</Button>
					</Actions>
				</Stack>
			</Sheet>
		</Overlay>
	);
}
